-- Migration number: 0001 	 2024-11-23T22:44:04.896Z

CREATE TABLE IF NOT EXISTS prices (
    site_id STRING PRIMARY KEY,
    brand STRING NOT NULL,
    address STRING NOT NULL,
    postcode STRING NOT NULL,
    location STRING NOT NULL,
    prices STRING NOT NULL,
    updated STRING NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prices_postcode ON prices(postcode);