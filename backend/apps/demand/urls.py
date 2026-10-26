from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health, name="health"),
    path("overview/", views.overview, name="overview"),
    path("products/", views.products, name="products"),
    path("products/<int:product_id>/", views.product_detail, name="product-detail"),
    path("inventory/movements/", views.inventory_movements, name="inventory-movements"),
    path("inventory/risks/", views.inventory_risks, name="inventory-risks"),
    path("forecasts/", views.forecasts, name="forecasts"),
]
