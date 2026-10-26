from rest_framework import serializers

from .models import InventoryMovement, Product


class ProductSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "sku",
            "category",
            "inventory",
            "reorder_point",
            "unit_price",
            "supplier",
            "lead_time_days",
            "status",
        ]
        read_only_fields = ["id", "status", "inventory"]

    def get_status(self, product):
        return "Reorder" if product.inventory <= product.reorder_point else "Healthy"


class InventoryMovementSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryMovement
        fields = [
            "id",
            "product",
            "quantity_change",
            "stock_before",
            "stock_after",
            "note",
            "created_at",
        ]
        read_only_fields = fields
