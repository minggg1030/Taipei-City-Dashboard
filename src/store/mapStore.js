// Cleaned

/* mapStore */
/*
The mapStore controls the map and includes methods to modify it.

!! PLEASE BE SURE TO REFERENCE THE MAPBOX DOCUMENTATION IF ANYTHING IS UNCLEAR !!
https://docs.mapbox.com/mapbox-gl-js/guides/
*/
import { createApp, defineComponent, nextTick, ref } from "vue";
import { defineStore } from "pinia";
import mapboxGl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import axios from "axios";

import mapStyle from "../assets/configs/mapbox/mapStyle.js";
import {
  MapObjectConfig,
  TaipeiTown,
  TaipeiVillage,
  maplayerCommonPaint,
  maplayerCommonLayout,
} from "../assets/configs/mapbox/mapConfig.js";
import { savedLocations } from "../assets/configs/mapbox/savedLocations.js";
import MapPopup from "../components/map/MapPopup.vue";

export const useMapStore = defineStore("map", {
  state: () => ({
    // Array of layer IDs that are in the map
    currentLayers: [],
    // Array of layer IDs that are in the map and currently visible
    currentVisibleLayers: [],
    // Stores all map configs for all layers (to be used to render popups)
    mapConfigs: {},
    // Stores the mapbox map instance
    map: null,
    // Stores popup information
    popup: null,
    // Stores saved locations
    savedLocations: savedLocations,
  }),
  getters: {},
  actions: {
    /* Initialize Mapbox */
    // 1. Creates the mapbox instance and passes in initial configs
    initializeMapBox() {
      const MAPBOXTOKEN = import.meta.env.VITE_MAPBOXTOKEN;
      mapboxGl.accessToken = MAPBOXTOKEN;
      this.map = new mapboxGl.Map({
        ...MapObjectConfig,
        style: mapStyle,
      });
      this.map.addControl(new mapboxGl.NavigationControl());
      this.map.doubleClickZoom.disable();
      this.map
        .on("style.load", () => {
          this.initializeBasicLayers();
        })
        .on("click", (event) => {
          if (this.popup) {
            this.popup = null;
          }
          this.addPopup(event);
        });
    },
    // 2. Adds two basic layers to the map (Taipei District and Taipei Village labels)
    initializeBasicLayers() {
      fetch(`/mapData/taipei_town.geojson`)
        .then((response) => response.json())
        .then((data) => {
          this.map
            .addSource("taipei_town", { type: "geojson", data: data })
            .addLayer(TaipeiTown("dark"));
        });
      fetch(`/mapData/taipei_village.geojson`)
        .then((response) => response.json())
        .then((data) => {
          this.map
            .addSource("taipei_village", { type: "geojson", data: data })
            .addLayer(TaipeiVillage("dark"));
        });
      this.addSymbolSources();
    },
    // 3. Adds symbols that will be used by some map layers
    addSymbolSources() {
      const images = [
        "metro",
        "triangle_green",
        "triangle_white",
        "bike_green",
      ];
      images.forEach((element) => {
        this.map.loadImage(`/images/${element}.png`, (error, image) => {
          if (error) throw error;
          this.map.addImage(element, image);
        });
      });
    },

    /* Adding Map Layers */
    // 1. Passes in the map_config (an Array of Objects) of a component and adds all layers to the map layer list
    addToMapLayerList(map_config) {
      map_config.forEach((element) => {
        let mapLayerId = `${element.index}-${element.type}`;
        // 1-1. If the layer exists, simply turn on the visibility and add it to the visible layers list
        if (this.currentLayers.find((element) => element === mapLayerId)) {
          this.turnOnMapLayerVisibility(mapLayerId);
          if (
            !this.currentVisibleLayers.find((element) => element === mapLayerId)
          ) {
            this.currentVisibleLayers.push(mapLayerId);
          }
          return;
        }
        let appendLayerId = { ...element };
        appendLayerId.layerId = mapLayerId;
        // 1-2. If the layer doesn't exist, call an API to get the layer data
        this.fetchLocalGeoJson(appendLayerId);
      });
    },
    // 2. Call an API to get the layer data
    fetchLocalGeoJson(map_config) {
      axios
        .get(`/mapData/${map_config.index}.geojson`)
        .then((rs) => {
          this.addMapLayerSource(map_config, rs.data);
        })
        .catch((e) => console.log(e));
    },
    // 3. Add the layer data as a source in mapbox
    addMapLayerSource(map_config, data) {
      this.map.addSource(`${map_config.layerId}-source`, {
        type: "geojson",
        data: data,
      });
      this.addMapLayer(map_config);
    },
    // 4. Using the mapbox source and map config, create a new layer
    // The styles and configs can be edited in /assets/configs/mapbox/mapConfig.js
    addMapLayer(map_config) {
      let extra_paint_configs = {};
      let extra_layout_configs = {};
      if (map_config.icon) {
        extra_paint_configs = {
          ...maplayerCommonPaint[`${map_config.type}-${map_config.icon}`],
        };
        extra_layout_configs = {
          ...maplayerCommonLayout[`${map_config.type}-${map_config.icon}`],
        };
      }
      if (map_config.size) {
        extra_paint_configs = {
          ...extra_paint_configs,
          ...maplayerCommonPaint[`${map_config.type}-${map_config.size}`],
        };
        extra_layout_configs = {
          ...extra_layout_configs,
          ...maplayerCommonLayout[`${map_config.type}-${map_config.size}`],
        };
      }
      this.map.addLayer({
        id: map_config.layerId,
        type: map_config.type,
        paint: {
          ...maplayerCommonPaint[`${map_config.type}`],
          ...extra_paint_configs,
          ...map_config.paint,
        },
        layout: {
          ...maplayerCommonLayout[`${map_config.type}`],
          ...extra_layout_configs,
        },
        source: `${map_config.layerId}-source`,
      });
      this.currentLayers.push(map_config.layerId);
      this.mapConfigs[map_config.layerId] = map_config;
      this.currentVisibleLayers.push(map_config.layerId);
    },
    //  5. Turn on the visibility for a exisiting map layer
    turnOnMapLayerVisibility(mapLayerId) {
      this.map.setLayoutProperty(mapLayerId, "visibility", "visible");
    },
    // 6. Turn off the visibility of an exisiting map layer but don't remove it completely
    turnOffMapLayerVisibility(map_config) {
      map_config.forEach((element) => {
        let mapLayerId = `${element.index}-${element.type}`;
        if (this.map.getLayer(mapLayerId)) {
          this.map.setLayoutProperty(mapLayerId, "visibility", "none");
        }
        this.currentVisibleLayers = this.currentVisibleLayers.filter(
          (element) => element !== mapLayerId
        );
      });
      this.removePopup();
    },

    /* Popup Related Functions */
    // Adds a popup when the user clicks on a item. The event will be passed in.
    addPopup(event) {
      // Gets the info that is contained in the coordinates that the user clicked on (only visible layers)
      const clickFeatureDatas = this.map.queryRenderedFeatures(event.point, {
        layers: this.currentVisibleLayers,
      });
      // Return if there is no info in the click
      if (!clickFeatureDatas || clickFeatureDatas.length === 0) {
        return;
      }
      // Parse clickFeatureDatas to get the first 3 unique layer datas, skip over already included layers
      const mapConfigs = [];
      const parsedPopupContent = [];
      let previousParsedLayer = "";

      for (let i = 0; i < clickFeatureDatas.length; i++) {
        if (mapConfigs.length === 3) break;
        if (previousParsedLayer === clickFeatureDatas[i].layer.id) continue;
        previousParsedLayer = clickFeatureDatas[i].layer.id;
        mapConfigs.push(this.mapConfigs[clickFeatureDatas[i].layer.id]);
        parsedPopupContent.push(clickFeatureDatas[i]);
      }
      // Create a new mapbox popup
      this.popup = new mapboxGl.Popup()
        .setLngLat(event.lngLat)
        .setHTML('<div id="vue-popup-content"></div>')
        .addTo(this.map);
      // Mount a vue component (MapPopup) to the id "vue-popup-content" and pass in data
      const PopupComponent = defineComponent({
        extends: MapPopup,
        setup() {
          // Only show the data of the topmost layer
          return {
            popupContent: parsedPopupContent,
            mapConfigs: mapConfigs,
            activeTab: ref(0),
          };
        },
      });
      // This helps vue determine the most optimal time to mount the component
      nextTick(() => {
        const app = createApp(PopupComponent);
        app.mount("#vue-popup-content");
      });
    },
    // Remove the current popup
    removePopup() {
      if (this.popup) {
        this.popup.remove();
      }
      this.popup = null;
    },

    /* Functions that change the viewing experience of the map */

    // Add new saved location that users can quickly zoom to
    addNewSavedLocation(name) {
      const coordinates = this.map.getCenter();
      const zoom = this.map.getZoom();
      const pitch = this.map.getPitch();
      const bearing = this.map.getBearing();
      this.savedLocations.push([coordinates, zoom, pitch, bearing, name]);
    },
    // Zoom to a location
    // [[lng, lat], zoom, pitch, bearing, savedLocationName]
    easeToLocation(location_array) {
      this.map.easeTo({
        center: location_array[0],
        zoom: location_array[1],
        duration: 4000,
        pitch: location_array[2],
        bearing: location_array[3],
      });
    },
    // Remove a saved location
    removeSavedLocation(index) {
      this.savedLocations.splice(index, 1);
    },
    // Force map to resize after sidebar collapses
    resizeMap() {
      if (this.map) {
        setTimeout(() => {
          this.map.resize();
        }, 200);
      }
    },

    /* Clearing the map */

    // Called when the user is switching between maps
    clearOnlyLayers() {
      this.currentLayers.forEach((element) => {
        this.map.removeLayer(element);
        this.map.removeSource(`${element}-source`);
      });
      this.currentLayers = [];
      this.mapConfigs = {};
      this.currentVisibleLayers = [];
      this.removePopup();
    },
    // Called when user navigates away from the map
    clearEntireMap() {
      this.currentLayers = [];
      this.mapConfigs = {};
      this.map = null;
      this.currentVisibleLayers = [];
      this.removePopup();
    },
  },
});
