"""Predictive Dosing Quality — Use Case 2.

A trained RandomForest classifier that predicts the probability a planned dose
will come out out-of-tolerance (over/under-dosed), from the material, product
recipe, target weight, batch size, and ingredient category.

  * train.py     — trains + evaluates the model, saves model.joblib + meta json
  * predictor.py — loads the saved model and serves predictions / model info
"""
