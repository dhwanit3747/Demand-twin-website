from django.db import models


class Product(models.Model):
    name = models.CharField(max_length=120)
    sku = models.CharField(max_length=40, unique=True)
    category = models.CharField(max_length=80)
    inventory = models.PositiveIntegerField(default=0)
    reorder_point = models.PositiveIntegerField(default=0)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    supplier = models.CharField(max_length=120, blank=True)
    lead_time_days = models.PositiveSmallIntegerField(default=3)
    status = models.CharField(max_length=20, default="Healthy")

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.sku})"


class Sale(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="sales")
    date = models.DateField(db_index=True)
    quantity = models.PositiveIntegerField()

    class Meta:
        ordering = ["date"]
        constraints = [
            models.UniqueConstraint(
                fields=["product", "date"],
                name="unique_product_sale_date",
            )
        ]

    def __str__(self):
        return f"{self.product.sku} — {self.date}: {self.quantity}"


class InventoryMovement(models.Model):
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="inventory_movements"
    )
    quantity_change = models.IntegerField()
    stock_before = models.PositiveIntegerField()
    stock_after = models.PositiveIntegerField()
    note = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.product.sku}: {self.quantity_change:+d}"
