"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Product = {
  id: number;
  name: string;
  sku: string;
  category: string;
  inventory: number;
  reorder_point: number;
  unit_price: string;
  supplier: string;
  lead_time_days: number;
  status: string;
};
type Risk = {
  product: Product;
  forecast_units: number;
  days_cover: number;
  lead_time_days: number;
  suggested_replenishment: number;
  risk: "High" | "Medium" | "Low";
  reason: string;
};
type Overview = {
  sales_last_7_days: number;
  sales_change_percent: number;
  forecast_next_7_days: number;
  inventory_value: number;
  low_stock_count: number;
  product_count: number;
  sales_history: { date: string; actual: number }[];
  featured_product: Product | null;
  featured_sales_history: { date: string; actual: number }[];
  featured_forecast: { date: string; quantity: number }[];
  historical_sales_revenue: number;
  workspace: { organization: string; store: string; city: string; currency: string; demo: boolean; live_data: boolean };
  top_products: { product: Product; historical_units: number }[];
  inventory_risks: Risk[];
};
type ForecastGroup = { product: Product; forecast: { date: string; quantity: number }[]; history: Overview["sales_history"] };
type Screen = "Dashboard" | "Demand Forecasts" | "Digital Twin" | "What-if Simulator" | "Data Mining" | "Inventory Risk" | "Products & Stores" | "Reports" | "Settings";
type SavedScenario = { product: string; promotion: number; priceChange: number; demand: number; savedAt: string };

const API_URL = (process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000/api" : "")).replace(/\/$/, "");
const number = new Intl.NumberFormat("en-IN");
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const associationRules = [
  { group: "Product Association Rules", rows: [["Cold Drinks", "Packaged Snacks", "18%", "60.0%", "1.50×", "180"], ["Whole Wheat Bread", "Dairy Milk", "24%", "66.7%", "1.48×", "240"], ["Rice 5 kg", "Cooking Oil", "12%", "60.0%", "1.50×", "120"], ["Bottled Water", "Packaged Snacks", "10%", "50.0%", "1.25×", "100"]] },
  { group: "Purchase Patterns", rows: [["Morning baskets", "Fresh bread", "14%", "52.0%", "1.22×", "140"], ["Weekend baskets", "Packaged snacks", "20%", "58.0%", "1.35×", "200"], ["Large baskets", "Cooking oil", "11%", "47.0%", "1.18×", "110"]] },
  { group: "Customer Segmentation", rows: [["Value shoppers", "Staples", "32%", "71.0%", "1.31×", "320"], ["Convenience shoppers", "Beverages", "19%", "63.0%", "1.28×", "190"], ["Family baskets", "Dairy", "22%", "68.0%", "1.42×", "220"]] },
  { group: "Seasonal Patterns", rows: [["Warm weeks", "Cold Drinks", "26%", "64.0%", "1.56×", "260"], ["Festive period", "Packaged snacks", "17%", "55.0%", "1.29×", "170"], ["Monsoon period", "Bottled Water", "9%", "42.0%", "1.12×", "90"]] },
];
const navigation: { label: Screen; icon: string }[] = [
  { label: "Dashboard", icon: "⌂" },
  { label: "Demand Forecasts", icon: "⌁" },
  { label: "Digital Twin", icon: "◇" },
  { label: "What-if Simulator", icon: "☷" },
  { label: "Data Mining", icon: "▤" },
  { label: "Inventory Risk", icon: "△" },
  { label: "Products & Stores", icon: "▦" },
  { label: "Reports", icon: "▧" },
  { label: "Settings", icon: "⚙" },
];

function weeklyForecast(points: ForecastGroup["forecast"]) {
  return Array.from({ length: Math.ceil(points.length / 7) }, (_, index) => {
    const week = points.slice(index * 7, (index + 1) * 7);
    return {
      date: week[week.length - 1]?.date ?? "",
      quantity: week.reduce((sum, point) => sum + point.quantity, 0),
    };
  });
}

function bucketForecast(points: ForecastGroup["forecast"], period: "Daily" | "Weekly" | "Monthly") {
  if (period === "Daily") return points;
  const size = period === "Weekly" ? 7 : 28;
  return Array.from({ length: Math.ceil(points.length / size) }, (_, index) => {
    const bucket = points.slice(index * size, (index + 1) * size);
    return {
      date: bucket[bucket.length - 1]?.date ?? "",
      quantity: bucket.reduce((sum, point) => sum + point.quantity, 0),
    };
  });
}

function scenarioDemand(base: number, promotion: number, priceChange: number) {
  return Math.max(0, Math.round(base * (1 + (promotion / 10) * 0.139 - priceChange * 0.025)));
}

async function responseMessage(response: Response) {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object") {
      return Object.values(body as Record<string, unknown>)
        .flatMap((value) => Array.isArray(value) ? value : [value])
        .filter((value): value is string => typeof value === "string")
        .join(" ") || `The request failed (${response.status}).`;
    }
  } catch {
    return `The request failed (${response.status}).`;
  }
  return `The request failed (${response.status}).`;
}

function Card({ title, subtitle, className = "", children }: { title?: string; subtitle?: string; className?: string; children: React.ReactNode }) {
  return <section className={`card ${className}`}>{title && <div className="card-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>}{children}</section>;
}

function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "green" | "red" | "amber" }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

function TrendChart({ actual, forecast = [] }: { actual: Overview["sales_history"]; forecast?: ForecastGroup["forecast"] }) {
  const historyValues = actual.map((point) => point.actual);
  const futureValues = forecast.slice(0, 4).map((point) => point.quantity);
  const values = [...historyValues, ...futureValues];
  const peak = Math.max(...values, 1) * 1.22;
  const chartPoints = values.map((value, index) => ({
    x: 40 + index * (720 / Math.max(values.length - 1, 1)),
    y: 214 - (value / peak) * 160,
  }));
  const historyLine = chartPoints.slice(0, historyValues.length).map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const forecastLine = chartPoints.slice(Math.max(0, historyValues.length - 1)).map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  return <div className="chart"><svg viewBox="0 0 790 260" role="img" aria-label="Historical and predicted demand"><defs><linearGradient id="demand-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#d5f3e9" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient></defs>{[54, 94, 134, 174, 214].map((y) => <line key={y} x1="40" x2="770" y1={y} y2={y} className="chart-grid" />)}{[0, 1, 2, 3, 4].map((index) => <text key={index} x="1" y={58 + index * 40} className="chart-label">{number.format(Math.round(peak * (4 - index) / 4))}</text>)}{chartPoints.length > 1 && <path d={`${historyLine} L${chartPoints[historyValues.length - 1]?.x},214 L${chartPoints[0]?.x},214 Z`} fill="url(#demand-fill)" />}{historyLine && <path d={historyLine} className="chart-actual" />}{forecastLine && <path d={forecastLine} className="chart-predicted" />}{actual.map((point, index) => <text key={point.date} x={chartPoints[index]?.x ?? 0} y="244" textAnchor="middle" className="chart-label">{new Date(`${point.date}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</text>)}</svg></div>;
}

export default function Dashboard() {
  const [screen, setScreen] = useState<Screen>("Dashboard");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [forecasts, setForecasts] = useState<ForecastGroup[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [mutationError, setMutationError] = useState("");
  const [saving, setSaving] = useState(false);
  const [simProduct, setSimProduct] = useState("");
  const [promotion, setPromotion] = useState(10);
  const [priceChange, setPriceChange] = useState(0);
  const [replenishment, setReplenishment] = useState(120);
  const [inventoryOverride, setInventoryOverride] = useState<number | null>(null);
  const [simulationComplete, setSimulationComplete] = useState(false);
  const [savedScenario, setSavedScenario] = useState<SavedScenario | null>(null);
  const [scenarioMessage, setScenarioMessage] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("demandtwin-saved-scenario");
      if (stored) setSavedScenario(JSON.parse(stored) as SavedScenario);
    } catch {
      setScenarioMessage("Saved scenario data could not be read from this browser.");
    }
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!createOpen && !stockProduct) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        setCreateOpen(false);
        setStockProduct(null);
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [createOpen, stockProduct, saving]);

  const load = useCallback(async (query = "") => {
    setLoading(true);
    setError("");
    try {
      if (!API_URL) {
        throw new Error("The API is not configured. Set NEXT_PUBLIC_API_URL to your deployed API URL in the Vercel project settings.");
      }
      const [overviewResponse, productsResponse, forecastsResponse, riskResponse] = await Promise.all([
        fetch(`${API_URL}/overview/`, { cache: "no-store" }),
        fetch(`${API_URL}/products/${query ? `?search=${encodeURIComponent(query)}` : ""}`, { cache: "no-store" }),
        fetch(`${API_URL}/forecasts/`, { cache: "no-store" }),
        fetch(`${API_URL}/inventory/risks/`, { cache: "no-store" }),
      ]);
      for (const response of [overviewResponse, productsResponse, forecastsResponse, riskResponse]) {
        if (!response.ok) throw new Error(`The API request failed (${response.status}). Check that Django is running.`);
      }
      const [overviewData, productData, forecastData, riskData] = await Promise.all([
        overviewResponse.json() as Promise<Overview>,
        productsResponse.json() as Promise<Product[]>,
        forecastsResponse.json() as Promise<ForecastGroup[]>,
        riskResponse.json() as Promise<Risk[]>,
      ]);
      setOverview(overviewData);
      setProducts(productData);
      setForecasts(forecastData);
      setRisks(riskData);
      if (!simProduct && forecastData.length) setSimProduct(String(forecastData[0].product.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load workspace data.");
    } finally {
      setLoading(false);
    }
  }, [simProduct]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(search); }, 200);
    return () => window.clearTimeout(timer);
  }, [load, search]);
  useEffect(() => {
    const timer = window.setInterval(() => { void load(search); }, 30000);
    return () => window.clearInterval(timer);
  }, [load, search]);

  const selectedForecast = useMemo(() => forecasts.find((item) => String(item.product.id) === simProduct) ?? forecasts[0], [forecasts, simProduct]);
  const selectedRisk = risks.find((item) => item.product.id === selectedForecast?.product.id);
  const baseline = selectedForecast?.forecast.slice(0, 7).reduce((sum, point) => sum + point.quantity, 0) ?? 360;
  const hypothetical = scenarioDemand(baseline, promotion, priceChange);
  const price = Number(selectedForecast?.product.unit_price ?? 50);
  const effectivePrice = price * (1 + priceChange / 100) * (1 - promotion / 100);
  const availableStock = (inventoryOverride ?? selectedForecast?.product.inventory ?? 280) + replenishment;
  const stockGap = Math.max(0, hypothetical + 40 - availableStock);

  function saveCurrentScenario() {
    const scenario = {
      product: selectedForecast?.product.name ?? "Product",
      promotion,
      priceChange,
      demand: hypothetical,
      savedAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem("demandtwin-saved-scenario", JSON.stringify(scenario));
      setSavedScenario(scenario);
      setScenarioMessage("Scenario saved in this browser.");
      setNotice("Scenario saved on this device.");
    } catch {
      setScenarioMessage("Unable to save this scenario in browser storage.");
    }
  }

  async function createProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setMutationError("");
    try {
      const response = await fetch(`${API_URL}/products/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: String(form.get("name")).trim(), sku: String(form.get("sku")).trim(), category: String(form.get("category")).trim(), reorder_point: Number(form.get("reorder_point")), unit_price: String(form.get("unit_price")), supplier: String(form.get("supplier")).trim(), lead_time_days: Number(form.get("lead_time_days")) }) });
      if (!response.ok) throw new Error(await responseMessage(response));
      setCreateOpen(false);
      await load(search);
      setNotice("Product added.");
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : "Unable to create product.");
    } finally { setSaving(false); }
  }

  async function adjustStock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stockProduct) return;
    const form = new FormData(event.currentTarget);
    const quantity = Number(form.get("quantity_change"));
    if (!Number.isSafeInteger(quantity) || quantity === 0) { setMutationError("Enter a non-zero whole-number change."); return; }
    setSaving(true);
    setMutationError("");
    try {
      const response = await fetch(`${API_URL}/inventory/movements/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_id: stockProduct.id, quantity_change: quantity, note: String(form.get("note")) }) });
      if (!response.ok) throw new Error(await responseMessage(response));
      setStockProduct(null);
      await load(search);
      setNotice("Inventory updated.");
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : "Unable to adjust inventory.");
    } finally { setSaving(false); }
  }

  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon">⌁</span><span>DemandTwin <b>AI</b></span></div>
      <nav className="side-nav" aria-label="Main navigation">{navigation.map((item) => <button key={item.label} onClick={() => setScreen(item.label)} className={screen === item.label ? "selected" : ""}><span>{item.icon}</span>{item.label}</button>)}</nav>
      <div className="workspace-promo"><Tag tone="green">Demo workspace</Tag><p>Explore decisions safely. No live connection or trained model.</p><span className="unavailable-action">Data connections are not available in this demo.</span></div>
      <div className="profile"><span className="profile-avatar">AP</span><span><b>Aarav Patel</b><small>Workspace owner · Demo</small></span></div>
    </aside>
    <main className="main-shell">
      <header className="topbar"><div className="store-label"><span>▣</span><b>FreshMart Supermarket</b><span className="store-city">Ahmedabad</span></div><div className="top-actions"><Tag>Demo data · Not live</Tag><button aria-label="Help" aria-expanded={helpOpen} onClick={() => { setHelpOpen((open) => !open); setNotificationsOpen(false); }}>ⓘ</button><button aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen((open) => !open); setHelpOpen(false); }}>♧</button><span className="profile-avatar small" aria-label="Aarav Patel">AP</span></div></header>
      {(helpOpen || notificationsOpen) && <aside className="top-popover" role="dialog" aria-label={helpOpen ? "Help" : "Notifications"}><button className="popover-close" aria-label="Close" onClick={() => { setHelpOpen(false); setNotificationsOpen(false); }}>×</button>{helpOpen ? <><h2>About this demo</h2><p>DemandTwin is an illustrative retail-planning demo. Forecasts and scenario outputs are assumptions, not business guarantees.</p><p>Use Products &amp; Stores to add products or adjust stock. Exports download to your device. No orders are placed.</p></> : <><h2>Workspace alerts</h2><p>{risks.filter((risk) => risk.risk !== "Low").length ? `${risks.filter((risk) => risk.risk !== "Low").length} products need inventory review.` : "No products currently need inventory review."}</p><button className="text-button" onClick={() => { setScreen("Inventory Risk"); setNotificationsOpen(false); }}>View inventory risks</button></>}</aside>}
      <div className="page-content">
        {loading && !overview ? <div className="loading">Loading the FreshMart demo workspace…</div> : error && !overview ? <div className="error">{error}<button className="button primary" onClick={() => void load(search)}>Retry</button><p>Check that the configured API is reachable and allows requests from this website. For local development, start Django and run <code>python manage.py seed_demo</code>.</p></div> : overview && <ScreenContent
          screen={screen} overview={overview} products={products} forecasts={forecasts} risks={risks} selectedForecast={selectedForecast} selectedRisk={selectedRisk} baseline={baseline} hypothetical={hypothetical} price={price} effectivePrice={effectivePrice} availableStock={availableStock} inventoryOverride={inventoryOverride} setInventoryOverride={setInventoryOverride} stockGap={stockGap} search={search} setSearch={setSearch} setScreen={setScreen} setCreateOpen={setCreateOpen} setStockProduct={setStockProduct} promotion={promotion} setPromotion={setPromotion} priceChange={priceChange} setPriceChange={setPriceChange} replenishment={replenishment} setReplenishment={setReplenishment} simProduct={simProduct} setSimProduct={setSimProduct} simulationComplete={simulationComplete} setSimulationComplete={setSimulationComplete} saveScenario={saveCurrentScenario} savedScenario={savedScenario} scenarioMessage={scenarioMessage} load={load} today={today}
        />}
      </div>
    </main>
    <nav className="mobile-nav" aria-label="Mobile navigation">{[navigation[0], navigation[1], navigation[3], navigation[5], navigation[4]].map((item) => <button key={item.label} onClick={() => setScreen(item.label)} className={screen === item.label ? "selected" : ""}><span>{item.icon}</span>{item.label === "Demand Forecasts" ? "Forecasts" : item.label === "What-if Simulator" ? "Simulator" : item.label === "Inventory Risk" ? "Inventory" : item.label === "Data Mining" ? "Insights" : "Home"}</button>)}</nav>
    {(createOpen || stockProduct) && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) { setCreateOpen(false); setStockProduct(null); } }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close" aria-label="Close dialog" disabled={saving} onClick={() => { setCreateOpen(false); setStockProduct(null); }}>×</button>{createOpen ? <><h2 id="modal-title">Add a product</h2><p>Add the product to your shared FreshMart workspace.</p><form onSubmit={createProduct}><label>Product name<input name="name" maxLength={120} required /></label><label>SKU<input name="sku" maxLength={40} required /></label><label>Category<input name="category" maxLength={80} required /></label><label>Supplier<input name="supplier" maxLength={120} /></label><div className="form-pair"><label>Reorder point<input name="reorder_point" type="number" min="0" defaultValue="10" required /></label><label>Lead time (days)<input name="lead_time_days" type="number" min="0" defaultValue="3" required /></label></div><label>Unit price (₹)<input name="unit_price" type="number" min="0" step="0.01" defaultValue="0" required /></label>{mutationError && <div className="form-error">{mutationError}</div>}<button className="button primary" disabled={saving}>{saving ? "Saving…" : "Create product"}</button></form></> : stockProduct && <><h2 id="modal-title">Adjust inventory</h2><p>{stockProduct.name} · {number.format(stockProduct.inventory)} units on hand</p><form onSubmit={adjustStock}><label>Quantity change<input name="quantity_change" type="number" step="1" defaultValue={Math.max(1, risks.find((risk) => risk.product.id === stockProduct.id)?.suggested_replenishment ?? 1)} required /><small>Enter a positive number to receive stock or a negative number to remove it.</small></label><label>Reason<input name="note" maxLength={200} placeholder="e.g. Delivery received" /></label>{mutationError && <div className="form-error">{mutationError}</div>}<button className="button primary" disabled={saving}>{saving ? "Saving…" : "Save stock change"}</button></form></>}</section></div>}
    {notice && <div className="toast" role="status">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}
  </div>;
}

type ScreenProps = {
  screen: Screen; overview: Overview; products: Product[]; forecasts: ForecastGroup[]; risks: Risk[]; selectedForecast?: ForecastGroup; selectedRisk?: Risk; baseline: number; hypothetical: number; price: number; effectivePrice: number; availableStock: number; inventoryOverride: number | null; setInventoryOverride: (value: number) => void; stockGap: number; search: string; setSearch: (value: string) => void; setScreen: (value: Screen) => void; setCreateOpen: (value: boolean) => void; setStockProduct: (value: Product) => void; promotion: number; setPromotion: (value: number) => void; priceChange: number; setPriceChange: (value: number) => void; replenishment: number; setReplenishment: (value: number) => void; simProduct: string; setSimProduct: (value: string) => void; simulationComplete: boolean; setSimulationComplete: (value: boolean) => void; saveScenario: () => void; savedScenario: SavedScenario | null; scenarioMessage: string; load: (query?: string) => Promise<void>; today: string;
};

function ScreenContent(props: ScreenProps) {
  const { screen, overview, products, forecasts, risks } = props;
  if (screen === "Dashboard") return <DashboardView {...props} />;
  if (screen === "Demand Forecasts") return <ForecastsView {...props} />;
  if (screen === "Inventory Risk") return <RiskView {...props} />;
  if (screen === "What-if Simulator") return <SimulatorView {...props} />;
  if (screen === "Digital Twin") return <TwinView {...props} />;
  if (screen === "Data Mining") return <InsightsView {...props} />;
  if (screen === "Products & Stores") return <ProductsView {...props} />;
  if (screen === "Reports") return <ReportsView {...props} />;
  return <SettingsView {...props} />;
}

function PageHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

function DashboardView(props: ScreenProps) {
  const { overview, risks, forecasts, products, setScreen, setStockProduct } = props;
  const cold = forecasts.find((item) => item.product.sku === "CD-001") ?? forecasts[0];
  const coldRisk = risks.find((risk) => risk.product.id === cold?.product.id);
  const coldForecast = weeklyForecast(overview.featured_forecast ?? cold?.forecast ?? []);
  const coldUnits = (overview.featured_forecast ?? cold?.forecast ?? []).slice(0, 7).reduce((sum, point) => sum + point.quantity, 0);
  const coldHistory = overview.featured_sales_history ?? cold?.history ?? overview.sales_history;
  const highRisks = risks.filter((risk) => risk.risk === "High").length;
  const mediumRisks = risks.filter((risk) => risk.risk === "Medium").length;
  return <>
    <PageHeading title="Good morning, Aarav" subtitle="Your demand outlook, and the decisions that deserve attention." action={<div className="heading-actions"><Tag>▦ &nbsp;Last 7 days</Tag><button className="button primary" onClick={() => setScreen("What-if Simulator")}>☷ &nbsp;Run Simulation</button></div>} />
    <div className="stat-grid five">{[
      ["Total sales", money.format(overview.historical_sales_revenue), `Historical · ${overview.sales_change_percent >= 0 ? "+" : ""}${overview.sales_change_percent}% vs last week`, "green"],
      ["Total Units Sold", number.format(overview.sales_last_7_days), "Historical · last 7 days", "green"],
      ["Forecasted Demand", `${number.format(coldUnits)} units`, "Cold Drinks · Next week", "plain"],
      ["Inventory at Risk", `${highRisks + mediumRisks} SKUs`, `${highRisks} high · ${mediumRisks} medium · next 7 days`, "red"],
      ["Forecast Accuracy", "Not estimated", "No trained model in this demo", "plain"],
    ].map(([label, value, detail, tone]) => <article className="stat-card" key={label}><span>{label}</span><strong>{value}</strong><small className={tone}>{detail}</small></article>)}</div>
    <div className="dashboard-grid">
      <Card title="Demand outlook" className="outlook-card">
        <div className="outlook-product"><Tag tone="green">Cold Drinks</Tag><span>Ahmedabad · Weekly</span><button onClick={() => setScreen("Demand Forecasts")}>View forecasts ↗</button></div>
        <div className="outlook-metrics"><div><small>Historical · last 7 days</small><strong>{number.format(cold?.history.slice(-1)[0]?.actual ?? overview.sales_last_7_days)} units</strong></div><div><small>Predicted · next 7 days</small><strong className="green-text">{number.format(coldUnits)} units</strong></div><div><small>80% illustrative range</small><strong>{number.format(Math.round(coldUnits * .92))}–{number.format(Math.round(coldUnits * 1.08))}</strong></div></div>
        <div className="chart-label-row"><span>Units / week</span><span>History&nbsp; ← │ → &nbsp;Forecast</span></div>
        <TrendChart actual={coldHistory} forecast={coldForecast} />
        <div className="legend"><span><i className="legend-navy" />Historical actual</span><span><i className="legend-green" />Predicted</span><span><i className="legend-band" />80% uncertainty band</span></div>
        <p className="disclaimer">Forecast begins {props.today}. Illustrative values; no trained model or live data connection.</p>
      </Card>
      <div className="stack">
        <Card title="What needs your attention">
          {coldRisk && <><Tag tone="red">{highRisks} high-risk products</Tag><h3>{coldRisk.product.name} could run short next week.</h3><p>{number.format(coldRisk.product.inventory)} units on hand vs {number.format(coldRisk.forecast_units)} predicted. A {coldRisk.lead_time_days}-day supplier lead time raises stock-out risk.</p><button className="button" onClick={() => setStockProduct(coldRisk.product)}>◇ &nbsp;Review {number.format(coldRisk.suggested_replenishment)}-unit replenishment</button></>}
          {!coldRisk && <p>Inventory coverage is above supplier lead times.</p>}
        </Card>
        <Card className="mint-card" title="Test before you commit"><p>What if a 10% promotion lifts demand? Compare a hypothetical 410 units against the 360-unit baseline.</p><small>Advisory estimate · Not a guaranteed outcome</small><button className="button primary" onClick={() => setScreen("What-if Simulator")}>☷ &nbsp;Open simulator</button></Card>
      </div>
    </div>
    <Card className="signal-card"><b>Seasonal signal · A warmer week may lift Cold Drinks demand</b><p>The demo assumes warmer weather and a local festive period. Validate weather, event dates and supplier capacity before acting.</p></Card>
    <div className="dashboard-grid bottom-grid">
      <Card title="Top products by historical units" subtitle={`Last 7 days · Store total ${number.format(overview.sales_last_7_days)} units`}>{overview.top_products.map((item) => <div className="rank-row" key={item.product.id}><span>{item.product.name}</span><span>{number.format(item.historical_units)} units</span><div className="rank-track"><i style={{ width: `${Math.max(5, item.historical_units / Math.max(...overview.top_products.map((entry) => entry.historical_units), 1) * 100)}%` }} /></div></div>)}</Card>
      <Card title="Low-stock products"><div className="table-scroll"><table><thead><tr><th>Product</th><th>On hand</th><th>Next week</th><th>Action</th></tr></thead><tbody>{risks.filter((risk) => risk.risk !== "Low").map((risk) => <tr key={risk.product.id}><td>{risk.product.name}</td><td>{number.format(risk.product.inventory)} units</td><td>{number.format(risk.forecast_units)} predicted</td><td><button className="text-button" onClick={() => setStockProduct(risk.product)}>Review +{number.format(risk.suggested_replenishment)}</button></td></tr>)}</tbody></table></div><small className="footnote">Suggested orders include a 40-unit demo safety buffer. Review expiry, lead times and shelf capacity.</small></Card>
    </div>
  </>;
}

function ForecastsView(props: ScreenProps) {
  const periods = ["Daily", "Weekly", "Monthly"] as const;
  const [period, setPeriod] = useState<(typeof periods)[number]>("Weekly");
  const [selectedId, setSelectedId] = useState(() =>
    String(
      props.forecasts.find((item) => item.product.sku === "CD-001")?.product.id ??
        props.forecasts[0]?.product.id ??
        "",
    ),
  );
  useEffect(() => {
    if (!props.forecasts.length) return;
    if (props.forecasts.some((item) => String(item.product.id) === selectedId)) return;
    const defaultForecast = props.forecasts.find((item) => item.product.sku === "CD-001") ?? props.forecasts[0];
    setSelectedId(String(defaultForecast.product.id));
  }, [props.forecasts, selectedId]);
  const data = props.forecasts.find((item) => String(item.product.id) === selectedId) ?? props.forecasts.find((item) => item.product.sku === "CD-001") ?? props.forecasts[0];
  const forecast = data?.forecast ?? [];
  const nextWeek = forecast.slice(0, 7).reduce((sum, point) => sum + point.quantity, 0);
  const previousWeek = data?.history[data.history.length - 1]?.actual ?? props.overview.sales_last_7_days;
  const change = previousWeek ? ((nextWeek - previousWeek) / previousWeek) * 100 : 0;
  return <><PageHeading title="Demand Forecasts" subtitle="A forward-looking view, with the reasons and uncertainty in plain sight." action={<button className="button" onClick={() => downloadCsv("demand-forecast.csv", [["Product", "SKU", "Date", "Predicted units"], ...props.forecasts.flatMap((group) => group.forecast.map((point) => [group.product.name, group.product.sku, point.date, String(point.quantity)]))])}>⇩ &nbsp;Export forecast</button>} />
    <div className="filter-row"><label>Product<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{props.forecasts.map((item) => <option key={item.product.id} value={String(item.product.id)}>{item.product.name}</option>)}</select></label><div className="filter-context"><span>Store</span><b>Ahmedabad Central</b></div><div className="filter-context"><span>Forecast window</span><b>Next 28 days</b></div></div>
    <div className="stat-grid four">{[["Expected units · next week", number.format(nextWeek), "Predicted baseline · demo"],["Historical units · last week", number.format(previousWeek), "Observed demo"],["Change vs historical week", `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`, "Not a like-for-like actual"],["80% illustrative interval", `${number.format(Math.round(nextWeek * .92))}–${number.format(Math.round(nextWeek * 1.08))}`, "Units / week · not a guarantee"]].map(([label, value, sub]) => <article className="stat-card" key={label}><span>{label}</span><strong>{value}</strong><small>{sub}</small></article>)}</div>
    <Card title={`${data?.product.name ?? "Product"} · Demand over time`} subtitle="Historical data is weekly; the forecast grouping follows the selected period."><div className="tabs">{periods.map((item) => <button className={period === item ? "active" : ""} onClick={() => setPeriod(item)} key={item}>{item}</button>)}</div><div className="chart-label-row"><span>Forecast units / {period.toLowerCase()}</span><span>History is shown by week</span></div><TrendChart actual={data?.history ?? props.overview.sales_history} forecast={bucketForecast(forecast, period)} /><div className="legend"><span><i className="legend-navy" />Historical actual · weekly</span><span><i className="legend-green" />Predicted · {period.toLowerCase()}</span></div><p className="disclaimer">Demo forecast generated from a trend-adjusted moving average. No trained model or live data.</p></Card>
    <div className="dashboard-grid two"><Card title="Why demand may rise"><p>Recent purchase trend and seasonal assumptions may influence the illustrative outlook.</p><div className="signal-card"><b>A signal, not a certainty</b><p>Connect validated business data before using this output to make operational decisions.</p></div></Card><Card title="How to read model quality"><p>Forecast accuracy is not estimated for this demo dataset.</p><Tag>Illustrative evaluation · Model not trained</Tag></Card></div>
  </>;
}

function RiskView(props: ScreenProps) {
  const [category, setCategory] = useState("All categories");
  const [supplier, setSupplier] = useState("All suppliers");
  const [riskLevel, setRiskLevel] = useState("All risk levels");
  const categories = [...new Set(props.risks.map((item) => item.product.category))].sort();
  const suppliers = [...new Set(props.risks.map((item) => item.product.supplier).filter(Boolean))].sort();
  const filtered = props.risks.filter((item) =>
    (category === "All categories" || item.product.category === category) &&
    (supplier === "All suppliers" || item.product.supplier === supplier) &&
    (riskLevel === "All risk levels" || item.risk === riskLevel),
  );
  const riskCount = filtered.filter((item) => item.risk !== "Low").length;
  return <><PageHeading title="Inventory Risk Center" subtitle="Prioritize the products that need review before the next demand period." action={<button className="button" onClick={() => downloadCsv("inventory-risk.csv", [["Product", "SKU", "Stock", "Forecast", "Days cover", "Lead time", "Risk", "Suggested replenishment"], ...filtered.map((r) => [r.product.name, r.product.sku, String(r.product.inventory), String(r.forecast_units), String(r.days_cover), String(r.lead_time_days), r.risk, String(r.suggested_replenishment)])])}>⇩ &nbsp;Export risk report</button>} />
    <div className="filter-row"><div className="filter-context"><span>Store</span><b>Ahmedabad Central</b></div><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option>All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Supplier<select value={supplier} onChange={(event) => setSupplier(event.target.value)}><option>All suppliers</option>{suppliers.map((item) => <option key={item}>{item}</option>)}</select></label><label>Risk level<select value={riskLevel} onChange={(event) => setRiskLevel(event.target.value)}><option>All risk levels</option><option>High</option><option>Medium</option><option>Low</option></select></label></div>
    <div className="stat-grid four">{[["Products needing review", String(riskCount), "Risk period · next 7 days"],["Cold Drinks coverage", `${props.risks.find((risk) => risk.product.sku === "CD-001")?.days_cover ?? 0} days`, "Supplier lead-time context"],["Baseline replenishment", `${number.format(props.risks.find((risk) => risk.product.sku === "CD-001")?.suggested_replenishment ?? 0)} units`, "Includes illustrative 40-unit buffer"],["Review period", "Next 7 days", "Illustrative demand period"]].map(([label, value, sub]) => <article className="stat-card" key={label}><span>{label}</span><strong>{value}</strong><small>{sub}</small></article>)}</div>
    <Card title="Prioritized replenishment review" subtitle={`${filtered.length} of ${props.risks.length} products · Suggested quantities are advisory`}><div className="table-scroll"><table><thead><tr><th>Product / supplier</th><th>Stock</th><th>Forecast / wk</th><th>Days cover</th><th>Risk</th><th>Review quantity</th><th>Reason</th><th>Action</th></tr></thead><tbody>{filtered.map((risk) => <tr key={risk.product.id}><td><b>{risk.product.name}</b><small className="table-sub">{risk.product.supplier || "Supplier not set"}</small></td><td>{number.format(risk.product.inventory)}</td><td>{number.format(risk.forecast_units)}</td><td>{risk.days_cover}</td><td><Tag tone={risk.risk === "High" ? "red" : risk.risk === "Medium" ? "amber" : "green"}>{risk.risk} risk</Tag></td><td>{number.format(risk.suggested_replenishment)} units</td><td>{risk.reason}</td><td><button className="text-button" onClick={() => props.setStockProduct(risk.product)}>Adjust stock</button></td></tr>)}</tbody></table>{filtered.length === 0 && <p className="empty-state">No products match these filters.</p>}</div></Card>
    <div className="dashboard-grid two"><Card className="mint-card" title="Review before ordering"><p>Check pending orders, expiry dates, supplier lead time and shelf capacity.</p><small>No order is placed from this screen.</small></Card><Card title="No automatic ordering"><p>Replenishment quantities are advisory. Confirm stock, expiry, pending orders and supplier lead time before acting.</p></Card></div>
  </>;
}

function SimulatorView(props: ScreenProps) {
  const selected = props.forecasts.find((item) => String(item.product.id) === props.simProduct) ?? props.selectedForecast;
  const base = selected?.forecast.slice(0, 7).reduce((sum, point) => sum + point.quantity, 0) ?? 0;
  const hypothetical = scenarioDemand(base, props.promotion, props.priceChange);
  const supply = props.availableStock;
  const gap = Math.max(0, hypothetical + 40 - supply);
  const price = Number(selected?.product.unit_price ?? 0);
  const discountedPrice = props.effectivePrice;
  const diff = hypothetical * discountedPrice - base * price;
  return <><PageHeading title="What-if Simulator" subtitle="Explore an illustrative decision. Scenario inputs do not change live operations." action={<button className="button" onClick={props.saveScenario}>♧ &nbsp;Save Scenario</button>} />
    <div className="simulator-layout"><Card title="Configure your scenario" className="sim-controls"><Tag tone="amber">Promotion +{props.promotion}%</Tag><label>Product<select value={props.simProduct} onChange={(event) => { props.setSimProduct(event.target.value); props.setInventoryOverride(Number(props.forecasts.find((item) => String(item.product.id) === event.target.value)?.product.inventory ?? 0)); }}>{props.forecasts.map((item) => <option value={item.product.id} key={item.product.id}>{item.product.name}</option>)}</select></label><div className="filter-context"><span>Store · Forecast window</span><b>Ahmedabad Central · Next 7 days</b></div><RangeControl label="Price change" value={props.priceChange} min={-20} max={20} onChange={props.setPriceChange} suffix="%" /><RangeControl label="Promotion · Discount" value={props.promotion} min={0} max={30} onChange={props.setPromotion} suffix="%" /><div className="filter-context"><span>Event &amp; weather</span><b>Demo baseline · No adjustable event data</b></div><RangeControl label="Starting inventory" value={props.inventoryOverride ?? selected?.product.inventory ?? 0} min={0} max={2000} onChange={props.setInventoryOverride} suffix=" units" /><RangeControl label="Planned replenishment" value={props.replenishment} min={0} max={500} onChange={props.setReplenishment} suffix=" units" /><button className="button primary" onClick={() => props.setSimulationComplete(true)}>▷ &nbsp;Run Simulation</button><button className="button" onClick={() => { props.setPromotion(10); props.setPriceChange(0); props.setReplenishment(120); props.setInventoryOverride(selected?.product.inventory ?? 0); props.setSimulationComplete(false); }}>⟲ &nbsp;Reset Scenario</button>{props.scenarioMessage && <small role="status">{props.scenarioMessage}</small>}<small>Assumptions are illustrative. The scenario is saved only in this browser; no orders or prices are changed.</small></Card>
      <div className="sim-results"><div className="section-title-row"><h2>{props.simulationComplete ? "Simulation complete" : "Scenario preview"}</h2><Tag tone="green">Illustrative scenario</Tag></div><div className="dashboard-grid two"><Card title="Predicted baseline"><strong className="large-number">{number.format(base)} units</strong><small>No adjustment · ₹{number.format(price)} / unit</small><small>80% range · {number.format(Math.round(base * .92))}–{number.format(Math.round(base * 1.08))}</small></Card><Card title="Hypothetical scenario"><strong className="large-number amber-text">{number.format(hypothetical)} units</strong><Tag tone="amber">{hypothetical - base >= 0 ? "+" : ""}{number.format(hypothetical - base)} units / {base ? `${((hypothetical - base) / base * 100).toFixed(1)}%` : "—"}</Tag><small>80% range · illustrative only</small></Card></div><Card title="Baseline vs hypothetical demand"><div className="bar-chart"><div><span>{number.format(base)}</span><i style={{ height: `${Math.min(95, base / Math.max(base, hypothetical, 1) * 85)}%` }} /><small>Predicted baseline</small></div><div><span>{number.format(hypothetical)}</span><i className="amber-bar" style={{ height: `${Math.min(95, hypothetical / Math.max(base, hypothetical, 1) * 85)}%` }} /><small>Hypothetical scenario</small></div></div><p className="disclaimer">Hypothetical values are assumptions, not observed outcomes or causal evidence.</p></Card><div className="dashboard-grid two"><Card title="Stock-out risk"><Tag tone={gap ? "red" : "green"}>{gap ? `High risk · ${number.format(gap)}-unit gap` : "Covered · illustrative buffer"}</Tag><p>{number.format(supply)} available after replenishment vs {number.format(hypothetical)} hypothetical demand.</p><small>No numerical probability estimated.</small></Card><Card title="Excess inventory"><Tag tone="green">{supply > hypothetical ? `${number.format(supply - hypothetical)}-unit surplus` : "Low risk · no surplus"}</Tag><p>Actual demand could be lower than the scenario.</p></Card></div><Card title="Hypothetical revenue · Not a forecast"><p>Baseline value: {number.format(base)} × ₹{number.format(price)} = {money.format(base * price)}</p><p>Scenario value: {number.format(hypothetical)} × ₹{number.format(discountedPrice)} = {money.format(hypothetical * discountedPrice)}</p><b className={diff >= 0 ? "green-text" : "red-text"}>Hypothetical difference: {diff >= 0 ? "+" : ""}{money.format(diff)}</b><p className="disclaimer">Assumes all demand is fulfilled at the adjusted price. Excludes costs, taxes, returns, and stock-outs.</p></Card></div>
    </div>
  </>;
}

function RangeControl({ label, value, min, max, onChange, suffix }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void; suffix: string }) {
  return <label className="range-label"><span>{label}<b>{number.format(value)}{suffix}</b></span><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} /><small>{min}{suffix}<i />{max}{suffix}</small></label>;
}

function TwinView(props: ScreenProps) {
  const [selectedId, setSelectedId] = useState(props.simProduct);
  const item = props.forecasts.find((entry) => String(entry.product.id) === selectedId) ?? props.forecasts[0];
  const risk = props.risks.find((entry) => entry.product.id === item?.product.id);
  const baseline = item?.forecast.slice(0, 7).reduce((sum, point) => sum + point.quantity, 0) ?? 0;
  return <><PageHeading title="Digital Twin Explorer" subtitle="See how business inputs connect to an illustrative demand outlook." action={<button className="button primary" onClick={() => { props.setSimProduct(String(item?.product.id ?? "")); props.setScreen("What-if Simulator"); }}>☷ &nbsp;Test a scenario</button>} /><div className="filter-row"><label>Selected product<select value={String(item?.product.id ?? "")} onChange={(event) => setSelectedId(event.target.value)}>{props.forecasts.map((entry) => <option key={entry.product.id} value={String(entry.product.id)}>{entry.product.name} · {entry.product.sku}</option>)}</select></label><div className="filter-context"><span>Store</span><b>Ahmedabad Central</b></div><div className="filter-context"><span>Forecast window</span><b>Next 7 days</b></div></div><Card title="Your demand system, made visible"><div className="twin-flow"><div><h3>Input factors</h3><p>Price · ₹{number.format(Number(item?.product.unit_price ?? 0))} per unit</p><p>Promotion · none in baseline</p><p>Season · demo baseline assumption</p></div><div className="twin-center"><Tag tone="green">Illustrative relationships</Tag><h2>{item?.product.name ?? "Product"}</h2><strong>{number.format(baseline)}</strong><span>Predicted units / week</span><Tag tone="green">80% range · {number.format(Math.round(baseline * .92))}–{number.format(Math.round(baseline * 1.08))}</Tag></div><div><h3>Business outlook</h3><p>Inventory coverage</p><strong>{risk?.days_cover ?? "—"} days</strong><p>{number.format(item?.product.inventory ?? 0)} on hand / {number.format(baseline)} forecast</p><Tag tone={risk?.risk === "High" ? "red" : risk?.risk === "Medium" ? "amber" : "green"}>{risk?.risk ?? "No risk data"} risk</Tag></div></div><p className="disclaimer">Not a live replica. No trained model. Relationships are advisory, not causal proof.</p></Card><div className="dashboard-grid two"><Card title="Current, historical & forecast behavior"><p>On hand · {number.format(item?.product.inventory ?? 0)} units</p><p>Historical · {number.format(item?.history.at(-1)?.actual ?? 0)} units sold last week</p><p>Predicted · {number.format(baseline)} units</p><p>Suggested review · {number.format(risk?.suggested_replenishment ?? 0)} units</p></Card><Card title="Sensitivity is conditional on data"><p>Price sensitivity: not estimated outside the scenario assumptions.</p><p>Promotion test: illustrative assumption only.</p><p>Weather &amp; holiday drivers: demo assumptions.</p></Card></div></>;
}

function InsightsView(props: ScreenProps) {
  const [activeTab, setActiveTab] = useState(associationRules[0].group);
  const selected = associationRules.find((tab) => tab.group === activeTab) ?? associationRules[0];
  return <><PageHeading title="Data Mining & Insights" subtitle="Explore illustrative patterns; these are demo examples, not customer-level analytics." action={<button className="button" onClick={() => downloadCsv("illustrative-association-rules.csv", [["If basket contains", "Then consider", "Support", "Confidence", "Lift", "Baskets"], ...selected.rows])}>⇩ &nbsp;Export rules</button>} /><div className="tabs">{associationRules.map((tab) => <button className={activeTab === tab.group ? "active" : ""} onClick={() => setActiveTab(tab.group)} key={tab.group}>{tab.group}</button>)}</div><div className="filter-context insight-context"><span>Location · Period</span><b>Ahmedabad Central · Illustrative demo data</b></div><div className="stat-grid three">{[["Support","18%","Share of demo baskets"],["Confidence","60%","Conditional demo frequency"],["Lift","1.50×","Association, not causation"]].map(([title,value,detail])=><article className="stat-card" key={title}><span>{title}</span><strong>{value}</strong><small>{detail}</small></article>)}</div><Card title={selected.group}><div className="table-scroll"><table><thead><tr><th>Signal</th><th>Related item / segment</th><th>Support</th><th>Confidence</th><th>Lift</th><th>Demo records</th></tr></thead><tbody>{selected.rows.map((row)=><tr key={row[0]}>{row.map((cell)=><td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div><small className="footnote">Illustrative records only · No customer-level data. Select a tab to view a different example set.</small></Card><div className="dashboard-grid two"><Card className="mint-card" title="Explore a merchandising test"><p>Compare basket behavior before assuming these demo associations indicate a sales lift.</p><Tag tone="green">Potential test · Not a recommendation</Tag></Card><Card title="Interpret with care"><p>Causality: Not established</p><p>Profitability: Costs not included</p><p>Future behavior: Uncertain</p></Card></div></>;
}

function ProductsView(props: ScreenProps) {
  const { products, search, setSearch, setCreateOpen, setStockProduct, load } = props;
  return <><PageHeading title="Products & Stores" subtitle="Manage the shared demo catalogue and review store-level inventory." action={<button className="button primary" onClick={() => setCreateOpen(true)}>+ &nbsp;Add product</button>} />  <div className="filter-row"><div className="filter-context"><span>Store</span><b>Ahmedabad Central · FM-AHD-01</b></div><label>Search products<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Product name or SKU" /></label><button className="button" onClick={() => void load(search)}>Refresh data</button></div><Card title="Product catalogue" subtitle={`${products.length} products · Changes sync through the shared API`}><div className="table-scroll"><table><thead><tr><th>Product / SKU</th><th>Category</th><th>Supplier</th><th>Stock</th><th>Lead time</th><th>Price</th><th>Action</th></tr></thead><tbody>{products.map((product)=><tr key={product.id}><td><b>{product.name}</b><small className="table-sub">{product.sku}</small></td><td>{product.category}</td><td>{product.supplier || "—"}</td><td>{number.format(product.inventory)} / {number.format(product.reorder_point)}</td><td>{product.lead_time_days} days</td><td>{money.format(Number(product.unit_price))}</td><td><button className="text-button" onClick={()=>setStockProduct(product)}>Adjust stock</button></td></tr>)}</tbody></table>{products.length === 0 && <p className="empty-state">No products match this search.</p>}</div></Card><Card className="mint-card" title="Demo workspace · no live connection"><p>Product, store, and supplier values are illustrative. No orders are placed from this interface.</p></Card></>;
}

function ReportsView(props: ScreenProps) {
  const { overview, products, risks, forecasts, savedScenario } = props;
  const workspaceRows = [
    ["Product", "SKU", "Inventory", "Historical units", "Forecast units", "Risk"],
    ...products.map((product) => {
      const risk = risks.find((item) => item.product.id === product.id);
      return [product.name, product.sku, String(product.inventory), String(overview.top_products.find((item) => item.product.id === product.id)?.historical_units ?? 0), String(risk?.forecast_units ?? 0), risk?.risk ?? "Unknown"];
    }),
  ];
  return <><PageHeading title="Reports" subtitle="Export current workspace data and illustrative analyses." action={<button className="button" onClick={() => downloadCsv("demandtwin-workspace-report.csv", workspaceRows)}>⇩ &nbsp;Export workspace report</button>} /><div className="dashboard-grid two"><Card title="Demand forecast" subtitle="Daily predictions for every product"><Tag>Current API data</Tag><p>Export forecast values by product and date.</p><button className="button" onClick={() => downloadCsv("demand-forecast.csv", [["Product", "SKU", "Date", "Predicted units"], ...forecasts.flatMap((group) => group.forecast.map((point) => [group.product.name, group.product.sku, point.date, String(point.quantity)]))])}>⇩ &nbsp;Export forecast CSV</button></Card><Card title="Inventory risk" subtitle="Current inventory and replenishment advice"><Tag>Current API data</Tag><p>Export the current risk review for all products.</p><button className="button" onClick={() => downloadCsv("inventory-risk.csv", [["Product", "SKU", "Stock", "Forecast", "Days cover", "Risk", "Suggested replenishment"], ...risks.map((risk) => [risk.product.name, risk.product.sku, String(risk.product.inventory), String(risk.forecast_units), String(risk.days_cover), risk.risk, String(risk.suggested_replenishment)])])}>⇩ &nbsp;Export risk CSV</button></Card><Card title="Purchase patterns" subtitle="Illustrative association examples"><Tag>Illustrative demo data</Tag><p>These examples are not computed from live basket data.</p><button className="button" onClick={() => downloadCsv("illustrative-purchase-patterns.csv", [["Signal", "Related item", "Support", "Confidence", "Lift", "Demo records"], ...associationRules.flatMap((tab) => tab.rows)])}>⇩ &nbsp;Export pattern CSV</button></Card><Card title="Saved simulation" subtitle="Stored only in this browser"><Tag>{savedScenario ? "Saved on this device" : "No scenario saved"}</Tag>{savedScenario ? <><p>{savedScenario.product} · {savedScenario.promotion}% promotion · {savedScenario.priceChange}% price change · {number.format(savedScenario.demand)} hypothetical units.</p><button className="button" onClick={() => downloadCsv("saved-scenario.csv", [["Product", "Promotion", "Price change", "Hypothetical demand", "Saved at"], [savedScenario.product, `${savedScenario.promotion}%`, `${savedScenario.priceChange}%`, String(savedScenario.demand), savedScenario.savedAt]])}>⇩ &nbsp;Export saved scenario</button></> : <p>Run and save a scenario in the What-if Simulator to export it here.</p>}</Card></div><Card title="About exports"><p>CSV files are created from the currently loaded workspace data and downloaded to your device.</p><small className="footnote">No files are uploaded or sent to a server.</small></Card></>;
}

function SettingsView(props: ScreenProps) {
  return <><PageHeading title="Workspace settings" subtitle="Review the fixed configuration for this demo workspace." action={<Tag>Read-only demo settings</Tag>} /><div className="dashboard-grid two"><Card title="Organization & regional defaults"><label>Organization name<input value={props.overview.workspace.organization} readOnly /></label><div className="dashboard-grid two"><label>Currency<input value={`${props.overview.workspace.currency} · ₹`} readOnly /></label><label>Timezone<input value="Asia/Kolkata" readOnly /></label></div><label>Primary contact<input value="aarav@freshmart.demo" readOnly /></label></Card><Card title="Primary store"><label>Store name<input value={props.overview.workspace.store} readOnly /></label><label>City<input value={props.overview.workspace.city} readOnly /></label><Tag>Demo store · Disconnected</Tag></Card></div><Card title="Integrations & data status"><div className="table-scroll"><table><thead><tr><th>Source</th><th>Data purpose</th><th>Status</th><th>Last sync</th></tr></thead><tbody>{[["CSV import","Sales, products, inventory"],["Point of sale","Transactions by product/store"],["Inventory system","Stock, lead times, suppliers"],["Weather provider","Optional weather factors"]].map(([source,purpose])=><tr key={source}><td>{source}</td><td>{purpose}</td><td>Not connected</td><td>Not available</td></tr>)}</tbody></table></div><p className="disclaimer">No integrations, account management, or external data sources are active in this demo. Settings are displayed for reference and cannot be edited.</p></Card></>;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
