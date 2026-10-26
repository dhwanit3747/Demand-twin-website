from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Product, Sale


class DemandApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.product = Product.objects.create(
            name="Demo Headphones",
            sku="AUD-100",
            category="Electronics",
            inventory=8,
            reorder_point=10,
            unit_price="49.99",
            supplier="Demo supplier",
            lead_time_days=7,
        )
        today = timezone.localdate()
        for offset in range(27, -1, -1):
            Sale.objects.create(
                product=self.product,
                date=today - timedelta(days=offset),
                quantity=10 + (offset % 4),
            )

    def test_health_endpoint(self):
        response = self.client.get(reverse("health"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "ok")

    def test_product_search_matches_sku(self):
        response = self.client.get(reverse("products"), {"search": "AUD-100"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["sku"], "AUD-100")

    def test_overview_aggregates_inventory_and_forecast(self):
        response = self.client.get(reverse("overview"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["product_count"], 1)
        self.assertEqual(response.data["low_stock_count"], 1)
        self.assertEqual(response.data["sales_last_7_days"], sum(
            10 + (offset % 4) for offset in range(6, -1, -1)
        ))
        self.assertGreater(response.data["forecast_next_7_days"], 0)
        self.assertEqual(len(response.data["sales_history"]), 7)
        self.assertEqual(response.data["workspace"]["city"], "Ahmedabad")

    def test_inventory_risk_endpoint_includes_replenishment_advice(self):
        response = self.client.get(reverse("inventory-risks"))

        self.assertEqual(response.status_code, 200)
        risk = next(item for item in response.data if item["product"]["id"] == self.product.id)
        self.assertEqual(risk["lead_time_days"], 7)
        self.assertGreaterEqual(risk["suggested_replenishment"], 0)
        self.assertIn(risk["risk"], ["High", "Medium", "Low"])

    def test_forecast_returns_daily_points(self):
        response = self.client.get(
            reverse("forecasts"), {"product_id": self.product.id}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(len(response.data[0]["forecast"]), 28)

    def test_forecast_returns_not_found_for_unknown_product(self):
        response = self.client.get(reverse("forecasts"), {"product_id": 9999})

        self.assertEqual(response.status_code, 404)

    def test_product_can_be_created_and_read_from_shared_api(self):
        response = self.client.post(
            reverse("products"),
            {
                "name": "Travel Mug",
                "sku": "LIV-200",
                "category": "Lifestyle",
                "reorder_point": 5,
                "unit_price": "18.50",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["inventory"], 0)
        self.assertEqual(
            self.client.get(reverse("products")).data[-1]["sku"], "LIV-200"
        )

    def test_stock_adjustment_updates_shared_product_and_records_movement(self):
        response = self.client.post(
            reverse("inventory-movements"),
            {
                "product_id": self.product.id,
                "quantity_change": 12,
                "note": "Restock",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["product"]["inventory"], 20)
        self.assertEqual(response.data["product"]["status"], "Healthy")
        self.assertEqual(response.data["movement"]["stock_before"], 8)
        self.assertEqual(response.data["movement"]["stock_after"], 20)
        self.product.refresh_from_db()
        self.assertEqual(self.product.inventory, 20)
        self.assertEqual(
            self.client.get(
                reverse("products"), {"search": self.product.sku}
            ).data[0]["inventory"],
            20,
        )

    def test_stock_adjustment_cannot_go_below_zero(self):
        response = self.client.post(
            reverse("inventory-movements"),
            {"product_id": self.product.id, "quantity_change": -9},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.inventory, 8)
