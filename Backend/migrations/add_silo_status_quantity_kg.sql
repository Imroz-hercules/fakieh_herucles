-- Add quantity column for DB5 bin qty (PLC_QTY_BIN_Address_List.xlsx)
ALTER TABLE public.silo_status
  ADD COLUMN IF NOT EXISTS quantity_kg DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_silo_status_quantity
  ON public.silo_status (quantity_kg)
  WHERE quantity_kg IS NOT NULL;
