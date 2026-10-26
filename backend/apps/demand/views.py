from datetime import timedelta

from django.db import transaction
from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .forecasting import forecast_for_product
from .models import InventoryMovement, Product, Sale
from .serializers import InventoryMovementSerializer, ProductSerializer


def weekly_sales_history(today, product=None, weeks=7):
    history = []
    for week_offset in range(weeks - 1, -1, -1):
        week_end = today - timedelta(days=week_offset * 7)
        week_start = week_end - timedelta(days=6)
        sales = Sale.objects.filter(date__gte=week_start, date__lte=week_end)
        if product is not None:
            sales = sales.filter(product=product)
        actual = sales.aggregate(total=Sum("quantity"))["total"] or 0
        history.append({"date": week_end.isoformat(), "actual": actual})
    return history


def inventory_risk_for(product):
    forecast = forecast_for_product(product, 7)
    predicted = sum(point["quantity"] for point in forecast)
    weekly_rate = predicted / 7
    days_cover = product.inventory / weekly_rate if weekly_rate else 999
    safety_buffer = 40
    suggested = max(0, predicted + safety_buffer - product.inventory)
    risk = (
        "High"
        if days_cover < product.lead_time_days
        else "Medium"
        if days_cover < product.lead_time_days + 2
        and product.inventory <= product.reorder_point
        else "Low"
    )
    return {
        "product": ProductSerializer(product).data,
        "forecast_units": predicted,
        "days_cover": round(days_cover, 1),
        "lead_time_days": product.lead_time_days,
        "suggested_replenishment": suggested,
        "risk": risk,
        "reason": (
            "Forecast demand may exceed stock before supplier lead time."
            if risk == "High"
            else "Review stock coverage, supplier lead time and assumptions."
        ),
    }


@api_view(["GET"])
def health(request):
    return Response({"status": "ok", "service": "DemandTwin API"})


@api_view(["GET", "POST"])
def products(request):
    if request.method == "POST":
        serializer = ProductSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        return Response(ProductSerializer(product).data, status=201)

    query = request.query_params.get("search", "").strip()
    queryset = Product.objects.all()
    if query:
        queryset = queryset.filter(Q(name__icontains=query) | Q(sku__icontains=query))
    return Response(ProductSerializer(queryset, many=True).data)


@api_view(["GET", "PATCH", "DELETE"])
def product_detail(request, product_id):
    product = get_object_or_404(Product, pk=product_id)
    if request.method == "GET":
        return Response(ProductSerializer(product).data)
    if request.method == "DELETE":
        product.delete()
        return Response(status=204)

    serializer = ProductSerializer(product, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(ProductSerializer(product).data)


@api_view(["GET", "POST"])
def inventory_movements(request):
    if request.method == "GET":
        queryset = InventoryMovement.objects.select_related("product")
        product_id = request.query_params.get("product_id")
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        return Response(InventoryMovementSerializer(queryset[:100], many=True).data)

    product_id = request.data.get("product_id")
    quantity_change = request.data.get("quantity_change")
    note = str(request.data.get("note", "")).strip()
    if isinstance(quantity_change, bool) or not isinstance(quantity_change, int):
        return Response({"quantity_change": ["Enter a whole number."]}, status=400)
    if quantity_change == 0:
        return Response({"quantity_change": ["Change must not be zero."]}, status=400)
    if len(note) > 200:
        return Response({"note": ["Ensure this field has no more than 200 characters."]}, status=400)

    with transaction.atomic():
        product = get_object_or_404(Product.objects.select_for_update(), pk=product_id)
        stock_before = product.inventory
        stock_after = stock_before + quantity_change
        if stock_after < 0:
            return Response(
                {"quantity_change": ["Stock cannot be reduced below zero."]},
                status=400,
            )
        product.inventory = stock_after
        product.save(update_fields=["inventory"])
        movement = InventoryMovement.objects.create(
            product=product,
            quantity_change=quantity_change,
            stock_before=stock_before,
            stock_after=stock_after,
            note=note,
        )

    return Response(
        {
            "product": ProductSerializer(product).data,
            "movement": InventoryMovementSerializer(movement).data,
        },
        status=201,
    )


@api_view(["GET"])
def overview(request):
    today = timezone.localdate()
    start = today - timedelta(days=6)
    previous_start = today - timedelta(days=13)
    previous_end = today - timedelta(days=7)
    current_sales = Sale.objects.filter(date__gte=start, date__lte=today).aggregate(
        total=Sum("quantity")
    )["total"] or 0
    previous_sales = Sale.objects.filter(
        date__gte=previous_start, date__lte=previous_end
    ).aggregate(total=Sum("quantity"))["total"] or 0
    change = (
        round(((current_sales - previous_sales) / previous_sales) * 100, 1)
        if previous_sales
        else 0
    )
    product_list = Product.objects.all()
    inventory_value = sum(
        product.inventory * product.unit_price for product in product_list
    )
    forecast_total = sum(
        point["quantity"]
        for product in product_list
        for point in forecast_for_product(product, 7)
    )
    chart = weekly_sales_history(today)
    featured_product = Product.objects.filter(sku="CD-001").first() or product_list.first()
    top_products = []
    for product in product_list:
        units = Sale.objects.filter(
            product=product, date__gte=start, date__lte=today
        ).aggregate(total=Sum("quantity"))["total"] or 0
        top_products.append(
            {
                "product": ProductSerializer(product).data,
                "historical_units": units,
            }
        )
    risks = [inventory_risk_for(product) for product in product_list]
    risks.sort(
        key=lambda item: (
            {"High": 0, "Medium": 1, "Low": 2}[item["risk"]],
            item["days_cover"],
        )
    )
    low_stock = sum(1 for item in risks if item["risk"] != "Low")

    return Response(
        {
            "sales_last_7_days": current_sales,
            "sales_change_percent": change,
            "forecast_next_7_days": forecast_total,
            "inventory_value": round(float(inventory_value), 2),
            "low_stock_count": low_stock,
            "product_count": product_list.count(),
            "sales_history": chart,
            "featured_product": (
                ProductSerializer(featured_product).data
                if featured_product
                else None
            ),
            "featured_sales_history": (
                weekly_sales_history(today, featured_product)
                if featured_product
                else []
            ),
            "featured_forecast": (
                forecast_for_product(featured_product, 28)
                if featured_product
                else []
            ),
            "workspace": {
                "organization": "FreshMart Supermarket",
                "store": "Ahmedabad Central",
                "city": "Ahmedabad",
                "currency": "INR",
                "timezone": "Asia/Kolkata",
                "demo": True,
                "live_data": False,
            },
            "historical_sales_revenue": round(
                sum(
                    item["historical_units"]
                    * float(item["product"]["unit_price"])
                    for item in top_products
                ),
                2,
            ),
            "top_products": sorted(
                top_products,
                key=lambda item: item["historical_units"],
                reverse=True,
            ),
            "inventory_risks": risks,
        }
    )


@api_view(["GET"])
def forecasts(request):
    product_id = request.query_params.get("product_id")
    queryset = Product.objects.all()
    if product_id:
        queryset = queryset.filter(id=product_id)
    results = [
        {
            "product": ProductSerializer(product).data,
            "forecast": forecast_for_product(product, 28),
            "history": weekly_sales_history(timezone.localdate(), product),
        }
        for product in queryset
    ]
    if product_id and not results:
        return Response({"detail": "Product not found."}, status=404)
    return Response(results)


@api_view(["GET"])
def inventory_risks(request):
    results = [inventory_risk_for(product) for product in Product.objects.all()]
    risk_order = {"High": 0, "Medium": 1, "Low": 2}
    results.sort(key=lambda item: (risk_order[item["risk"]], item["days_cover"]))
    return Response(results)
