from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.demand.models import Product, Sale


DEMO_PRODUCTS = [
    {
        "name": "Cold Drinks",
        "sku": "CD-001",
        "category": "Beverages",
        "inventory": 280,
        "reorder_point": 320,
        "price": "50.00",
        "supplier": "CoolCo",
        "lead_time": 7,
        "historical_units": 320,
        "forecast_units": 360,
    },
    {
        "name": "Dairy Milk",
        "sku": "DM-002",
        "category": "Dairy",
        "inventory": 190,
        "reorder_point": 400,
        "price": "40.00",
        "supplier": "Amul demo",
        "lead_time": 3,
        "historical_units": 540,
        "forecast_units": 600,
    },
    {
        "name": "Whole Wheat Bread",
        "sku": "WB-003",
        "category": "Bakery",
        "inventory": 260,
        "reorder_point": 350,
        "price": "35.00",
        "supplier": "DailyBake",
        "lead_time": 2,
        "historical_units": 480,
        "forecast_units": 500,
    },
    {
        "name": "Bottled Water",
        "sku": "BW-004",
        "category": "Beverages",
        "inventory": 420,
        "reorder_point": 180,
        "price": "22.00",
        "supplier": "AquaCo",
        "lead_time": 7,
        "historical_units": 300,
        "forecast_units": 330,
    },
    {
        "name": "Rice 5 kg",
        "sku": "RC-005",
        "category": "Pantry",
        "inventory": 210,
        "reorder_point": 160,
        "price": "55.00",
        "supplier": "GrainCo",
        "lead_time": 3,
        "historical_units": 280,
        "forecast_units": 300,
    },
    {
        "name": "Packaged Snacks",
        "sku": "SN-006",
        "category": "Snacks",
        "inventory": 680,
        "reorder_point": 200,
        "price": "85.00",
        "supplier": "SnackCo",
        "lead_time": 5,
        "historical_units": 560,
        "forecast_units": 620,
    },
]
LEGACY_DEMO_SKUS = [
    "AUD-001",
    "AUD-002",
    "OFF-014",
    "OFF-021",
    "LIV-008",
    "OFF-032",
    "AUD-019",
    "LIV-022",
]


def distribute(total, days=7):
    base, remainder = divmod(total, days)
    return [base + (1 if index < remainder else 0) for index in range(days)]


class Command(BaseCommand):
    help = "Create the FreshMart Ahmedabad illustrative workspace and sales history."

    def handle(self, *args, **options):
        today = timezone.localdate()
        Product.objects.filter(sku__in=LEGACY_DEMO_SKUS).delete()
        for item in DEMO_PRODUCTS:
            product, _ = Product.objects.update_or_create(
                sku=item["sku"],
                defaults={
                    "name": item["name"],
                    "category": item["category"],
                    "inventory": item["inventory"],
                    "reorder_point": item["reorder_point"],
                    "unit_price": item["price"],
                    "supplier": item["supplier"],
                    "lead_time_days": item["lead_time"],
                    "status": (
                        "Reorder"
                        if item["inventory"] <= item["reorder_point"]
                        else "Healthy"
                    ),
                },
            )
            historical_week = distribute(item["historical_units"])
            previous_week = distribute(
                round(
                    item["historical_units"]
                    * item["historical_units"]
                    / item["forecast_units"]
                )
            )
            for offset in range(89, 13, -1):
                day = today - timedelta(days=offset)
                quantity = max(
                    1,
                    round(
                        item["historical_units"]
                        * 0.72
                        / 7
                        * (1 + 0.08 * ((offset % 7) / 6))
                    ),
                )
                Sale.objects.update_or_create(
                    product=product, date=day, defaults={"quantity": quantity}
                )
            for index, quantity in enumerate(previous_week):
                day = today - timedelta(days=13 - index)
                Sale.objects.update_or_create(
                    product=product, date=day, defaults={"quantity": quantity}
                )
            for index, quantity in enumerate(historical_week):
                day = today - timedelta(days=6 - index)
                Sale.objects.update_or_create(
                    product=product, date=day, defaults={"quantity": quantity}
                )
        self.stdout.write(
            self.style.SUCCESS(
                "FreshMart demo workspace seeded: 6 products and 90 days of sales."
            )
        )
