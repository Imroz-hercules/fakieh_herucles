"""
Single-pass streaming aggregation for /kpi/dashboard-analytics.
Avoids loading all KPIMaterial rows into a Python list at once.
"""
from __future__ import annotations


def build_dashboard_payload(query, start_date, end_date, batch_filters, product_filters, material_filters):
    """
    Execute `query` with stream_results + yield_per; return dict for jsonify(success=True)
    or None if no rows.
    """
    stream = query.execution_options(stream_results=True)
    total_materials = 0
    unique_batches = {}
    total_production_hours = 0.0
    daily_production = {}
    daily_downtime = {}
    total_actual = 0.0
    total_setpoint = 0.0
    within_tolerance = 0
    material_usage_dict = {}
    quantity_values_sum = 0.0
    quantity_values_count = 0
    variances_sum = 0.0
    variances_count = 0
    hourly_consumption = {}
    daily_comparison = {}
    processed_batches_delay = set()
    delay_by_category = {}
    shift_data = {
        "Shift A": {"planned": 0.0, "actual": 0.0},
        "Shift B": {"planned": 0.0, "actual": 0.0},
        "Shift C": {"planned": 0.0, "actual": 0.0},
    }
    hourly_load = {}
    daily_efficiency = {}
    daily_variance = {}
    total_energy = 0.0
    cost_savings = 0.0
    product_breakdown = {}

    for mat in stream.yield_per(800):
        total_materials += 1

        if mat.batch_guid not in unique_batches and mat.batch_act_start and mat.batch_act_end:
            duration = (mat.batch_act_end - mat.batch_act_start).total_seconds() / 3600
            unique_batches[mat.batch_guid] = {
                "duration": duration,
                "start": mat.batch_act_start,
                "end": mat.batch_act_end,
                "quantity": mat.quantity,
            }
            total_production_hours += duration

        if mat.batch_act_start:
            date_key = mat.batch_act_start.strftime("%Y-%m-%d")
            batch_key = f"{date_key}_{mat.batch_guid}"
            if batch_key not in daily_production:
                daily_production[batch_key] = {
                    "date": date_key,
                    "quantity": mat.quantity or 0,
                }

        if mat.batch_act_end and mat.batch_transfer_time and mat.batch_act_start:
            date_key = mat.batch_act_start.strftime("%Y-%m-%d")
            batch_key = f"{date_key}_{mat.batch_guid}"
            if batch_key not in daily_downtime:
                idle_seconds = (mat.batch_transfer_time - mat.batch_act_end).total_seconds()
                if idle_seconds > 0:
                    if date_key not in daily_downtime:
                        daily_downtime[date_key] = 0
                    daily_downtime[date_key] += idle_seconds
                daily_downtime[batch_key] = True

        total_actual += mat.actual_value_float or 0
        total_setpoint += mat.setpoint_float or 0
        if (
            mat.setpoint_float
            and mat.actual_value_float
            and mat.setpoint_float > 0
            and abs(((mat.actual_value_float - mat.setpoint_float) / mat.setpoint_float) * 100) <= 5
        ):
            within_tolerance += 1

        material_name = mat.material_name or "Unknown"
        material_usage_dict[material_name] = material_usage_dict.get(material_name, 0) + (
            mat.actual_value_float or 0
        )

        if mat.quantity and mat.quantity > 0:
            quantity_values_sum += mat.quantity
            quantity_values_count += 1

        if mat.setpoint_float and mat.actual_value_float and mat.setpoint_float > 0:
            variances_sum += abs(((mat.actual_value_float - mat.setpoint_float) / mat.setpoint_float) * 100)
            variances_count += 1

        if mat.batch_act_start and mat.quantity:
            hour = mat.batch_act_start.strftime("%H:00")
            hourly_consumption[hour] = hourly_consumption.get(hour, 0) + (mat.quantity / 1000)

        if mat.batch_act_start:
            date_key = mat.batch_act_start.strftime("%Y-%m-%d")
            if date_key not in daily_comparison:
                daily_comparison[date_key] = {"planned": 0.0, "actual": 0.0}
            daily_comparison[date_key]["planned"] += mat.setpoint_float or 0
            daily_comparison[date_key]["actual"] += mat.actual_value_float or 0

        batch_key_d = mat.batch_guid
        if batch_key_d not in processed_batches_delay and mat.batch_act_end and mat.batch_transfer_time:
            delay_seconds = (mat.batch_transfer_time - mat.batch_act_end).total_seconds()
            delay_minutes = delay_seconds / 60
            if delay_minutes > 5:
                category = mat.formula_category_name or "Unknown"
                if category not in delay_by_category:
                    delay_by_category[category] = {"duration": 0.0, "count": 0}
                delay_by_category[category]["duration"] += delay_minutes
                delay_by_category[category]["count"] += 1
            processed_batches_delay.add(batch_key_d)

        if mat.batch_act_start:
            hour = mat.batch_act_start.hour
            if 6 <= hour < 14:
                shift = "Shift A"
            elif 14 <= hour < 22:
                shift = "Shift B"
            else:
                shift = "Shift C"
            shift_data[shift]["planned"] += mat.setpoint_float or 0
            shift_data[shift]["actual"] += mat.actual_value_float or 0

        if mat.batch_act_start and mat.quantity:
            hour = mat.batch_act_start.strftime("%H:00")
            hourly_load[hour] = hourly_load.get(hour, 0) + (mat.quantity / 100)

        if mat.batch_act_start and mat.quantity and mat.quantity > 0:
            date_key = mat.batch_act_start.strftime("%Y-%m-%d")
            if date_key not in daily_efficiency:
                daily_efficiency[date_key] = {"energy_sum": 0.0, "quantity_sum": 0.0}
            energy_value = (
                mat.actual_value_float
                if mat.actual_value_float and mat.actual_value_float > 0
                else mat.quantity / 10
            )
            daily_efficiency[date_key]["energy_sum"] += energy_value
            daily_efficiency[date_key]["quantity_sum"] += mat.quantity / 1000

        if mat.batch_act_start and mat.setpoint_float and mat.actual_value_float and mat.setpoint_float > 0:
            date_key = mat.batch_act_start.strftime("%Y-%m-%d")
            variance_pct = ((mat.actual_value_float - mat.setpoint_float) / mat.setpoint_float) * 100
            if date_key not in daily_variance:
                daily_variance[date_key] = []
            daily_variance[date_key].append(variance_pct)

        if mat.actual_value_float and mat.actual_value_float > 0:
            total_energy += mat.actual_value_float
        if mat.setpoint_float and mat.actual_value_float:
            cost_savings += mat.setpoint_float - mat.actual_value_float

        product = mat.product_name or "Unknown"
        pb_key = f"{product}_{mat.batch_guid}"
        if pb_key not in product_breakdown:
            product_breakdown[pb_key] = {"product": product, "quantity": mat.quantity or 0}

    if total_materials == 0:
        return None

    total_days = max((end_date - start_date).days, 1)
    planned_hours = total_days * 24

    date_totals = {}
    for batch_data in daily_production.values():
        d = batch_data["date"]
        date_totals[d] = date_totals.get(d, 0) + batch_data["quantity"]
    production_trend = [
        {"date": date, "value": round(value, 2)} for date, value in sorted(date_totals.items(), reverse=True)[:30]
    ]
    production_trend.reverse()

    downtime_trend = []
    for date, seconds in sorted(daily_downtime.items(), reverse=True):
        if not isinstance(seconds, bool):
            downtime_trend.append({"date": date, "duration": round(seconds / 3600, 2)})
    downtime_trend = downtime_trend[:14]
    downtime_trend.reverse()

    availability = round((total_production_hours / planned_hours) * 100, 1) if planned_hours > 0 else 0
    availability = min(availability, 100)
    performance = round((total_actual / total_setpoint) * 100, 1) if total_setpoint > 0 else 0
    quality = round((within_tolerance / total_materials) * 100, 1) if total_materials > 0 else 0
    oee_value = round((availability * performance * quality) / 10000, 1)
    oee_components = [
        {"name": "Availability", "value": availability},
        {"name": "Performance", "value": performance},
        {"name": "Quality", "value": quality},
    ]

    sorted_materials = sorted(material_usage_dict.items(), key=lambda x: x[1], reverse=True)
    top_n = 10
    cost_distribution = [{"name": m, "value": round(v, 2)} for m, v in sorted_materials[:top_n]]
    if len(sorted_materials) > top_n:
        others_total = sum(v for _, v in sorted_materials[top_n:])
        cost_distribution.append({"name": "Others", "value": round(others_total, 2)})
    cost_breakdown = [{"name": m, "value": round(v, 2)} for m, v in sorted_materials[:10]]

    avg_quantity = quantity_values_sum / quantity_values_count if quantity_values_count else 0
    power_factor = round(min(avg_quantity / 10000, 1.0), 2) if avg_quantity > 0 else 0.92

    avg_variance = variances_sum / variances_count if variances_count else 0
    cost_control_score = max(100 - avg_variance, 0)
    target_batches = total_days * 3
    batch_completion_rate = (
        min((len(unique_batches) / target_batches) * 100, 100) if target_batches > 0 else 0
    )
    radar_kpis = [
        {"subject": "Production", "value": round(performance, 1), "fullMark": 100},
        {"subject": "Quality", "value": round(quality, 1), "fullMark": 100},
        {"subject": "Efficiency", "value": round(availability, 1), "fullMark": 100},
        {"subject": "Cost Control", "value": round(cost_control_score, 1), "fullMark": 100},
        {"subject": "Energy", "value": round((avg_quantity / 10000) * 100, 1) if avg_quantity > 0 else 0, "fullMark": 100},
        {"subject": "Management", "value": round(batch_completion_rate, 1), "fullMark": 100},
    ]

    energy_consumption = [
        {"hour": f"{h:02d}:00", "consumption": round(hourly_consumption.get(f"{h:02d}:00", 0), 2)}
        for h in range(24)
    ]

    planned_vs_actual = [
        {
            "date": date,
            "planned": round(values["planned"], 2),
            "actual": round(values["actual"], 2),
        }
        for date, values in sorted(daily_comparison.items(), reverse=True)[:7]
    ]
    planned_vs_actual.reverse()

    delay_analysis = [
        {"category": category, "duration": round(values["duration"], 2), "count": values["count"]}
        for category, values in sorted(delay_by_category.items(), key=lambda x: x[1]["duration"], reverse=True)
    ]

    shift_efficiency = [
        {
            "shift": shift,
            "efficiency": round((values["actual"] / values["planned"]) * 100, 1) if values["planned"] > 0 else 0,
        }
        for shift, values in shift_data.items()
    ]

    peak_load_hours = [
        {"hour": f"{h:02d}:00", "load": round(hourly_load.get(f"{h:02d}:00", 0), 2)} for h in range(24)
    ]

    efficiency_trend = [
        {
            "date": date,
            "efficiency": round(values["energy_sum"] / values["quantity_sum"], 2) if values["quantity_sum"] > 0 else 0,
        }
        for date, values in sorted(daily_efficiency.items(), reverse=True)[:14]
    ]
    efficiency_trend.reverse()

    cost_variance_trend = [
        {"date": date, "variance": round(sum(vs) / len(vs), 2)}
        for date, vs in sorted(daily_variance.items(), reverse=True)[:14]
    ]
    cost_variance_trend.reverse()

    total_production = sum(batch_data["quantity"] for batch_data in unique_batches.values())
    active_batches = len(unique_batches)
    total_quantity_tons = total_production / 1000 if total_production > 0 else 1
    avg_efficiency = (
        round(total_energy / total_quantity_tons, 2)
        if total_quantity_tons > 0 and total_energy > 0
        else 2.8
    )
    kpi_summary = {
        "totalProduction": round(total_production, 2),
        "activeBatches": active_batches,
        "oee": oee_value,
        "efficiency": avg_efficiency,
        "costSavings": round(cost_savings, 2),
    }

    top_materials = [{"name": material, "value": round(value, 2)} for material, value in sorted_materials[:10]]

    product_totals = {}
    for data in product_breakdown.values():
        p = data["product"]
        product_totals[p] = product_totals.get(p, 0) + data["quantity"]
    product_distribution = [
        {"name": product, "value": round(quantity, 2)}
        for product, quantity in sorted(product_totals.items(), key=lambda x: x[1], reverse=True)
    ]

    return {
        "success": True,
        "filters": {
            "startDate": start_date.strftime("%Y-%m-%d %H:%M:%S"),
            "endDate": end_date.strftime("%Y-%m-%d %H:%M:%S"),
            "batches": batch_filters,
            "products": product_filters,
            "materials": material_filters,
        },
        "summary": kpi_summary,
        "charts": {
            "productionTrend": production_trend,
            "downtimeTrend": downtime_trend,
            "oeeComponents": oee_components,
            "oeeValue": oee_value,
            "costDistribution": cost_distribution,
            "costBreakdown": cost_breakdown,
            "powerFactor": power_factor,
            "radarKPIs": radar_kpis,
            "energyConsumption": energy_consumption,
            "plannedVsActual": planned_vs_actual,
            "delayAnalysis": delay_analysis,
            "shiftEfficiency": shift_efficiency,
            "peakLoadHours": peak_load_hours,
            "efficiencyTrend": efficiency_trend,
            "costVarianceTrend": cost_variance_trend,
            "topMaterials": top_materials,
            "productDistribution": product_distribution,
        },
        "metadata": {
            "totalRecords": total_materials,
            "uniqueBatches": len(unique_batches),
            "uniqueProducts": len(product_totals),
            "uniqueMaterials": len(material_usage_dict),
            "dateRange": f"{start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}",
            "totalDays": total_days,
        },
    }
