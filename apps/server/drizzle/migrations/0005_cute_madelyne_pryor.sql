CREATE TABLE "space_aurora" (
	"observed" timestamp with time zone PRIMARY KEY NOT NULL,
	"forecast" timestamp with time zone NOT NULL,
	"power_north" real,
	"power_south" real,
	"grid" "bytea" NOT NULL
);
