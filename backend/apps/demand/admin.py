from django.contrib import admin

from .models import InventoryMovement, Product, Sale


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "sku", "category", "inventory", "reorder_point", "status")
    search_fields = ("name", "sku")
    list_filter = ("category", "status")


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ("product", "date", "quantity")
    list_filter = ("date",)


@admin.register(InventoryMovement)
class InventoryMovementAdmin(admin.ModelAdmin):
    list_display = ("product", "quantity_change", "stock_before", "stock_after", "created_at")
    list_filter = ("created_at",)
    readonly_fields = ("product", "quantity_change", "stock_before", "stock_after", "note", "created_at")
