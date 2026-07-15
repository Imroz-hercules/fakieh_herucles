"""Live dosing-quality monitoring.

Turns the predictive model from a manual "type in a dose and predict" widget
into an automatic online monitor: batches stream in from a data source (the
bundled CSV replay now, the plant SQL Server at deployment), every batch is
scored the moment it arrives, risky doses are flagged for the operator, the
input distribution is watched for drift, and the model retrains itself
(zero-downtime) when the plant's production mix moves away from what it was
trained on.
"""
