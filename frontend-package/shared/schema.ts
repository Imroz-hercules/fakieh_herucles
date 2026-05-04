import { pgTable, text, serial, integer, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const facilities = pgTable("facilities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  status: text("status").notNull(), // 'operational', 'warning', 'offline'
  dailyProduction: real("daily_production").notNull(),
  efficiency: real("efficiency").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const metrics = pgTable("metrics", {
  id: serial("id").primaryKey(),
  facilityId: integer("facility_id").references(() => facilities.id),
  metricType: text("metric_type").notNull(),
  value: real("value").notNull(),
  unit: text("unit").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  facilityId: integer("facility_id").references(() => facilities.id),
  severity: text("severity").notNull(), // 'low', 'medium', 'high', 'critical'
  message: text("message").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFacilitySchema = createInsertSchema(facilities).omit({
  id: true,
  lastUpdated: true,
});

export const insertMetricSchema = createInsertSchema(metrics).omit({
  id: true,
  timestamp: true,
});

export const insertAlertSchema = createInsertSchema(alerts).omit({
  id: true,
  createdAt: true,
});

export type Facility = typeof facilities.$inferSelect;
export type InsertFacility = z.infer<typeof insertFacilitySchema>;
export type Metric = typeof metrics.$inferSelect;
export type InsertMetric = z.infer<typeof insertMetricSchema>;
export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = z.infer<typeof insertAlertSchema>;

// Chart data types
export type ChartDataPoint = {
  timestamp: string;
  value: number;
  label?: string;
};

export type FacilityMetrics = {
  flowRate: ChartDataPoint[];
  pressure: ChartDataPoint[];
  energyConsumption: ChartDataPoint[];
  qualityScore: ChartDataPoint[];
};

// Dashboard Widget Configuration
export const dashboardWidgets = pgTable("dashboard_widgets", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  chartType: text("chart_type").notNull(), // 'line', 'bar', 'pie', 'donut', 'gauge'
  metricType: text("metric_type").notNull(), // 'pressure', 'flow', 'quality', 'energy'
  facilityId: integer("facility_id").references(() => facilities.id),
  position: integer("position").notNull().default(0),
  width: integer("width").notNull().default(1), // Grid width (1-4)
  height: integer("height").notNull().default(1), // Grid height (1-3)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Admin Configuration for Chart Types and Values
export const adminConfig = pgTable("admin_config", {
  id: serial("id").primaryKey(),
  configType: text("config_type").notNull(), // 'chart_types', 'metric_types'
  configValue: text("config_value").notNull(),
  displayName: text("display_name").notNull(),
  isEnabled: boolean("is_enabled").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDashboardWidgetSchema = createInsertSchema(dashboardWidgets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAdminConfigSchema = createInsertSchema(adminConfig).omit({
  id: true,
  createdAt: true,
});

export type DashboardWidget = typeof dashboardWidgets.$inferSelect;
export type InsertDashboardWidget = z.infer<typeof insertDashboardWidgetSchema>;
export type AdminConfig = typeof adminConfig.$inferSelect;
export type InsertAdminConfig = z.infer<typeof insertAdminConfigSchema>;
