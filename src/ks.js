function initKS($, viewKeysToRegister = []) {
  const knackAppMetadata = Knack.loader_api;
  console.log(knackAppMetadata);
  const appId = knackAppMetadata.application_id;
  console.log(appId);

  // Create a metadata cache object
  const metadataCache = {
    application: { id: appId },
    objects: {},
    scenes: {},
    views: {},
    lastUpdated: null,
    db: null,
  };

  // Initialize IndexedDB for metadata caching
  async function initMetadataDb() {
    if (metadataCache.db) return metadataCache.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(`KnackSync_${appId}`, 1);

      request.onupgradeneeded = function (event) {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("metadata")) {
          db.createObjectStore("metadata", { keyPath: "id" });
        }
      };

      request.onsuccess = function (event) {
        metadataCache.db = event.target.result;
        resolve(metadataCache.db);
      };

      request.onerror = function (event) {
        console.error("IndexedDB error:", event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Get object metadata for a given object key
  async function getObjectMetadata(objectKey) {
    // Check memory cache first
    if (metadataCache.objects[objectKey]) {
      return metadataCache.objects[objectKey];
    }

    try {
      // Check IndexedDB cache
      const db = await initMetadataDb();
      const tx = db.transaction(["metadata"], "readonly");
      const store = tx.objectStore("metadata");
      const cachedObject = await new Promise((resolve) => {
        const request = store.get(`object_${objectKey}`);
        request.onsuccess = () =>
          resolve(request.result ? request.result.value : null);
        request.onerror = () => resolve(null);
      });

      if (cachedObject) {
        metadataCache.objects[objectKey] = cachedObject;
        return cachedObject;
      }

      // Find object in knackAppMetadata
      const objectData = knackAppMetadata.objects.find(
        (obj) => obj.key === objectKey,
      );
      if (objectData) {
        // Store in IndexedDB
        const txWrite = db.transaction(["metadata"], "readwrite");
        const storeWrite = txWrite.objectStore("metadata");
        storeWrite.put({
          id: `object_${objectKey}`,
          value: objectData,
          timestamp: Date.now(),
        });

        // Update memory cache
        metadataCache.objects[objectKey] = objectData;
        return objectData;
      }

      return null;
    } catch (error) {
      console.error(`Error getting metadata for object ${objectKey}:`, error);
      return null;
    }
  }

  // Get view metadata for a given view key
  async function getViewMetadata(viewKey) {
    // Check memory cache first
    if (metadataCache.views[viewKey]) {
      return metadataCache.views[viewKey];
    }

    try {
      // Check IndexedDB cache
      const db = await initMetadataDb();
      const tx = db.transaction(["metadata"], "readonly");
      const store = tx.objectStore("metadata");
      const cachedView = await new Promise((resolve) => {
        const request = store.get(`view_${viewKey}`);
        request.onsuccess = () =>
          resolve(request.result ? request.result.value : null);
        request.onerror = () => resolve(null);
      });

      if (cachedView) {
        metadataCache.views[viewKey] = cachedView;
        return cachedView;
      }

      // Find scene containing this view in knackAppMetadata
      let viewData = null;
      const sceneWithView = knackAppMetadata.scenes.find(
        (scene) =>
          scene.views && scene.views.some((view) => view.key === viewKey),
      );

      if (sceneWithView) {
        viewData = sceneWithView.views.find((view) => view.key === viewKey);
        if (viewData) {
          // Add scene information
          viewData.scene = {
            key: sceneWithView.key,
            name: sceneWithView.name,
            slug: sceneWithView.slug,
          };

          // Store in IndexedDB
          const txWrite = db.transaction(["metadata"], "readwrite");
          const storeWrite = txWrite.objectStore("metadata");
          storeWrite.put({
            id: `view_${viewKey}`,
            value: viewData,
            timestamp: Date.now(),
          });

          // Update memory cache
          metadataCache.views[viewKey] = viewData;
        }
      }

      return viewData;
    } catch (error) {
      console.error(`Error getting metadata for view ${viewKey}:`, error);
      return null;
    }
  }

  // Compare data structure with our cached metadata
  async function compareDataWithMetadata(viewKey, data) {
    try {
      // Get the view metadata
      const viewMetadata = await getViewMetadata(viewKey);
      if (
        !viewMetadata ||
        !viewMetadata.source ||
        !viewMetadata.source.object
      ) {
        return { matches: true, differences: [] }; // No object source to compare
      }

      const objectKey = viewMetadata.source.object;
      const objectMetadata = await getObjectMetadata(objectKey);

      if (!objectMetadata || !objectMetadata.fields) {
        return { matches: true, differences: [] }; // No fields to compare
      }

      // If data is an array, use the first item for structure comparison
      const sampleData =
        Array.isArray(data) && data.length > 0 ? data[0] : data;

      // Check for structural differences
      const differences = [];

      // Find fields that should exist based on the view
      const expectedFields = [];
      if (viewMetadata.columns) {
        viewMetadata.columns.forEach((column) => {
          if (column.field && column.field.key) {
            const fieldKey = column.field.key;
            const fieldMetadata = objectMetadata.fields.find(
              (f) => f.key === fieldKey,
            );

            if (fieldMetadata) {
              expectedFields.push({
                key: fieldKey,
                name: fieldMetadata.name,
                type: fieldMetadata.type,
              });
            }
          }
        });
      }

      // Check if all expected fields exist in the data
      expectedFields.forEach((field) => {
        const fieldExists = sampleData && sampleData.hasOwnProperty(field.key);
        if (!fieldExists) {
          differences.push({
            type: "missing_field",
            field: field,
          });
        }
      });

      // Check if there are fields in the data that aren't in the metadata
      if (sampleData) {
        Object.keys(sampleData).forEach((key) => {
          const fieldInMetadata = expectedFields.some((f) => f.key === key);
          if (!fieldInMetadata && !key.startsWith("_") && key !== "id") {
            differences.push({
              type: "unexpected_field",
              field: { key },
            });
          }
        });
      }

      return {
        matches: differences.length === 0,
        differences,
      };
    } catch (error) {
      console.error(`Error comparing data for view ${viewKey}:`, error);
      return { matches: false, error: error.message };
    }
  }

  // Process view data when view is rendered
  async function processViewData(viewKey, data) {
    console.log(`Processing view data for ${viewKey}`);

    // Compare data with metadata
    const comparison = await compareDataWithMetadata(viewKey, data);

    if (!comparison.matches) {
      console.log(
        `Data structure differs from metadata for view ${viewKey}:`,
        comparison.differences,
      );
      // You could trigger metadata refresh here if needed
    }

    // Additional processing can be done here, such as:
    // - Syncing data to local storage
    // - Updating UI components
    // - Calculating derived values

    return {
      viewKey,
      processed: true,
      comparison,
    };
  }

  // Register event handlers for the specified views
  function registerViewHandlers() {
    //If no specific views were provided, register a handler for any view
    if (!viewKeysToRegister || viewKeysToRegister.length === 0) {
      $(document).on("knack-view-render.any", function (event, view, data) {
        console.log("View rendered:", view.key);
        processViewData(view.key, data);
      });
      return;
    }

    // Register handlers for each specified view
    viewKeysToRegister.forEach((viewKey) => {
      $(document).on(
        `knack-view-render.${viewKey}`,
        function (event, view, data) {
          console.log(`Registered view rendered: ${viewKey}`);
          processViewData(viewKey, data);
        },
      );
    });

    console.log(`Registered handlers for ${viewKeysToRegister.length} views`);
  }

  // Initialize the system
  async function init() {
    try {
      // Initialize database
      await initMetadataDb();

      // Register view handlers
      registerViewHandlers();

      console.log(
        `KnackSync initialized for app ${appId} with ${viewKeysToRegister.length} registered views`,
      );
      return true;
    } catch (error) {
      console.error("Error initializing KnackSync:", error);
      return false;
    }
  }

  // Start initialization
  return init();
}
