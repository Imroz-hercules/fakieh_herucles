-- Link live PLC orders to fleet trucks and delivery clients (app metadata; not sent to PLC).

ALTER TABLE intake_orders ADD COLUMN IF NOT EXISTS truck_id INTEGER;
ALTER TABLE intake_orders ADD COLUMN IF NOT EXISTS client_id INTEGER;

ALTER TABLE outloading_orders ADD COLUMN IF NOT EXISTS truck_id INTEGER;
ALTER TABLE outloading_orders ADD COLUMN IF NOT EXISTS client_id INTEGER;

ALTER TABLE bulk_line_orders ADD COLUMN IF NOT EXISTS truck_id INTEGER;
ALTER TABLE bulk_line_orders ADD COLUMN IF NOT EXISTS client_id INTEGER;

ALTER TABLE pt_line_orders ADD COLUMN IF NOT EXISTS truck_id INTEGER;
ALTER TABLE pt_line_orders ADD COLUMN IF NOT EXISTS client_id INTEGER;
