-- Business client number (separate from auto-increment id)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_number VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_clients_client_number
  ON public.clients (LOWER(client_number))
  WHERE client_number IS NOT NULL AND client_number <> '';
