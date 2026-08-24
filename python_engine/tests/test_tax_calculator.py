from python_engine.tax_calculator_us_pk_uk import estimate_withholding
def test_tax_estimate():assert estimate_withholding('PK',100).estimated_withholding==15
