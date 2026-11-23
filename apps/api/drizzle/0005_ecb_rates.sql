CREATE TABLE "ecb_rates" (
	"date" date NOT NULL,
	"currency" text NOT NULL,
	"rate_per_eur" text NOT NULL,
	CONSTRAINT "ecb_rates_date_currency_pk" PRIMARY KEY("date","currency")
);
