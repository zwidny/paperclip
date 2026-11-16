import type { ReactNode } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { useTranslation } from "../i18n";

export interface OrgChartActions {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}

/** Shared camera controls can stay mounted while the chart view fades away. */
export function OrgChartControls({ zoomIn, zoomOut, fit, children }: OrgChartActions & { children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="org-chart-controls flex items-center gap-2" role="group" aria-label={t("orgChart.controlsAria", { defaultValue: "Org chart controls" })}>
      <div className="design-view-toggle" role="group" aria-label={t("orgChart.chartCameraAria", { defaultValue: "Chart camera" })}>
        <Button variant="ghost" size="icon-sm" className="design-toolbar-icon" aria-label={t("orgChart.zoomOut", { defaultValue: "Zoom out" })} title={t("orgChart.zoomOut", { defaultValue: "Zoom out" })} onClick={zoomOut}><Minus className="size-4" /></Button>
        <Button variant="ghost" size="icon-sm" className="design-toolbar-icon" aria-label={t("orgChart.zoomIn", { defaultValue: "Zoom in" })} title={t("orgChart.zoomIn", { defaultValue: "Zoom in" })} onClick={zoomIn}><Plus className="size-4" /></Button>
        <Button variant="ghost" size="icon-sm" className="design-toolbar-icon" aria-label={t("orgChart.fitChartAria", { defaultValue: "Fit chart to screen" })} title={t("orgChart.fitChartAria", { defaultValue: "Fit chart to screen" })} onClick={fit}><Maximize2 className="size-4" /></Button>
      </div>
      {children}
    </div>
  );
}
