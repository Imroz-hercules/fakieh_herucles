-- Live Order Workflow: persisted queue for sequential RFID-matched PLC dispatch.
-- The app also creates this table automatically via ensure_order_queue_table();
-- this script is for manual / pipeline application on existing installs.

CREATE TABLE IF NOT EXISTS public.order_queue (
    id              SERIAL PRIMARY KEY,
    order_type      VARCHAR(20)  NOT NULL,
    db_no           INTEGER      NOT NULL,
    line            INTEGER      NOT NULL DEFAULT 0,
    rfid_number     VARCHAR(50),
    queue_status    VARCHAR(20)  NOT NULL DEFAULT 'WAITING',
    queue_position  INTEGER,
    badge_no        VARCHAR(50),
    material_code   VARCHAR(50),
    material_name   VARCHAR(100),
    declared_qty_kg DOUBLE PRECISION,
    dest1           VARCHAR(50),
    dest2           VARCHAR(50),
    dest_sel        VARCHAR(50),
    source_silo     VARCHAR(50),
    cc25_sel        VARCHAR(50),
    scale_sel       VARCHAR(50),
    pit_no          VARCHAR(50),
    raw_code        VARCHAR(50),
    truck_id        INTEGER,
    client_id       INTEGER,
    note            VARCHAR(255),
    created_at      TIMESTAMP DEFAULT now(),
    dispatched_at   TIMESTAMP,
    started_at      TIMESTAMP,
    completed_at    TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_order_queue_dispatch
    ON public.order_queue (order_type, line, queue_status, queue_position);
CREATE INDEX IF NOT EXISTS ix_order_queue_status ON public.order_queue (queue_status);
CREATE INDEX IF NOT EXISTS ix_order_queue_rfid   ON public.order_queue (rfid_number);
