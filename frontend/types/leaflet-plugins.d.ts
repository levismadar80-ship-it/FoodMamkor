/**
 * Module:   leaflet-plugins.d.ts
 * Purpose:  Types for what this repo adds to Leaflet: L.markerClusterGroup
 *           (leaflet.markercluster ships no types and @types is not
 *           installed), the producer tags MapComponent puts on each marker
 *           (MEH-1412, MEH-1568), and the private _getIconUrl that MiniMap
 *           deletes to fix the default icon paths.
 * Usage:    /// <reference path="<relative path>/types/leaflet-plugins.d.ts" />
 * Does NOT: type the cluster plugin completely, only the calls this repo makes.
 * History:  14/11/2026 — created (MEH-3167, legacy components/ type-check).
 */
import type { FeatureGroup, Layer } from "leaflet";

declare module "leaflet" {
  interface MarkerClusterGroup extends FeatureGroup {
    addLayers(layers: Layer[]): this;
    removeLayers(layers: Layer[]): this;
    refreshClusters(): this;
  }
  function markerClusterGroup(options?: Record<string, unknown>): MarkerClusterGroup;

  interface Marker {
    /** MEH-1412: the business id, so a cluster counts businesses, not pins. */
    producerId?: string | number;
    /** MEH-1568: the business itself, for a single-business cluster's icon. */
    producer?: Record<string, unknown>;
  }

  namespace Icon {
    interface Default {
      _getIconUrl?: unknown;
    }
  }
}
