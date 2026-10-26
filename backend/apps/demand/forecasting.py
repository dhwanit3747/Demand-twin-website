from datetime import timedelta

from django.utils import timezone

from .models import Sale


def forecast_for_product(product, days=14):
    """Return a small, explainable trend-adjusted forecast from recent daily sales."""
    today = timezone.localdate()
    history = list(
        Sale.objects.filter(
            product=product,
            date__gte=today - timedelta(days=27),
            date__lte=today,
        )
        .order_by("date")
        .values_list("date", "quantity")
    )
    quantities = [quantity for _, quantity in history]
    if not quantities:
        return []

    recent = quantities[-7:]
    previous = quantities[-14:-7] or recent
    recent_average = sum(recent) / len(recent)
    previous_average = sum(previous) / len(previous)
    trend = 0 if previous_average == 0 else (recent_average - previous_average) / previous_average
    trend = max(-0.25, min(0.25, trend))
    forecasts = []
    for offset in range(1, days + 1):
        week_index = (offset - 1) // 7
        day_index = (offset - 1) % 7
        projected_week = sum(recent) * (1 + trend) ** (week_index + 1)
        weekly_total = max(0, int(projected_week + 1e-9))
        base_quantity, remainder = divmod(weekly_total, 7)
        value = base_quantity + (1 if day_index < remainder else 0)
        forecasts.append(
            {
                "date": (today + timedelta(days=offset)).isoformat(),
                "quantity": value,
            }
        )
    return forecasts
