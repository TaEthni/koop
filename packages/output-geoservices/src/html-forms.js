/**
 * HTML form pages for GeoServices endpoints.
 * Mimics the ArcGIS Server REST API HTML interface.
 */

function queryFormHtml(req) {
  const baseUrl = `${req.protocol}://${req.get('host')}${req.originalUrl.split('?')[0]}`;
  const parentUrl = baseUrl.replace(/\/query$/, '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Query: Layer (FeatureServer)</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #f4f4f4; color: #333; padding: 20px; }
    .container { max-width: 900px; margin: 0 auto; background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); }
    .header { background: #0079c1; color: #fff; padding: 16px 24px; border-radius: 8px 8px 0 0; }
    .header h1 { font-size: 18px; font-weight: 600; }
    .header a { color: #b3dbf2; text-decoration: none; font-size: 13px; }
    .header a:hover { color: #fff; }
    .breadcrumb { padding: 12px 24px; background: #e8e8e8; font-size: 13px; }
    .breadcrumb a { color: #0079c1; text-decoration: none; }
    .breadcrumb a:hover { text-decoration: underline; }
    form { padding: 24px; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px; color: #555; }
    .form-group input, .form-group select, .form-group textarea {
      width: 100%; padding: 8px 10px; border: 1px solid #ccc; border-radius: 4px;
      font-size: 14px; font-family: 'Consolas', 'Monaco', monospace;
    }
    .form-group textarea { height: 60px; resize: vertical; }
    .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
      outline: none; border-color: #0079c1; box-shadow: 0 0 0 2px rgba(0,121,193,0.2);
    }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .form-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
    .actions { padding: 16px 24px; background: #f9f9f9; border-radius: 0 0 8px 8px; border-top: 1px solid #e8e8e8; }
    .btn { padding: 10px 24px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 600; }
    .btn-primary { background: #0079c1; color: #fff; }
    .btn-primary:hover { background: #005e95; }
    .btn-secondary { background: #e8e8e8; color: #333; margin-left: 8px; }
    .btn-secondary:hover { background: #d0d0d0; }
    .help { font-size: 12px; color: #888; margin-top: 2px; }
    hr { border: none; border-top: 1px solid #e8e8e8; margin: 20px 0; }
    h3 { font-size: 14px; color: #0079c1; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Query: Layer 0 (FeatureServer)</h1>
    </div>
    <div class="breadcrumb">
      <a href="${parentUrl}">Layer</a> &rsaquo; Query
    </div>
    <form action="${baseUrl}" method="GET">

      <h3>Filter</h3>
      <div class="form-group">
        <label for="where">Where</label>
        <input type="text" id="where" name="where" value="1=1" placeholder="e.g. iso3='USA'">
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="outFields">Out Fields</label>
          <input type="text" id="outFields" name="outFields" value="*" placeholder="* or field1,field2">
        </div>
        <div class="form-group">
          <label for="resultRecordCount">Result Record Count</label>
          <input type="number" id="resultRecordCount" name="resultRecordCount" value="10" min="1">
        </div>
      </div>

      <hr>
      <h3>Geometry</h3>
      <div class="form-row-3">
        <div class="form-group">
          <label for="returnGeometry">Return Geometry</label>
          <select id="returnGeometry" name="returnGeometry">
            <option value="true" selected>true</option>
            <option value="false">false</option>
          </select>
        </div>
        <div class="form-group">
          <label for="simplify">Simplify (degrees)</label>
          <input type="text" id="simplify" name="simplify" value="" placeholder="e.g. 0.01 (~1km)">
          <div class="help">0.001≈100m, 0.01≈1km, 0.1≈10km</div>
        </div>
        <div class="form-group">
          <label for="outSR">Output Spatial Ref (WKID)</label>
          <input type="text" id="outSR" name="outSR" value="" placeholder="e.g. 4326">
        </div>
      </div>

      <div class="form-group">
        <label for="geometry">Spatial Filter (envelope)</label>
        <input type="text" id="geometry" name="geometry" value="" placeholder='{"xmin":-180,"ymin":-90,"xmax":180,"ymax":90}'>
      </div>

      <hr>
      <h3>Options</h3>
      <div class="form-row-3">
        <div class="form-group">
          <label for="returnCountOnly">Count Only</label>
          <select id="returnCountOnly" name="returnCountOnly">
            <option value="false" selected>false</option>
            <option value="true">true</option>
          </select>
        </div>
        <div class="form-group">
          <label for="returnIdsOnly">IDs Only</label>
          <select id="returnIdsOnly" name="returnIdsOnly">
            <option value="false" selected>false</option>
            <option value="true">true</option>
          </select>
        </div>
        <div class="form-group">
          <label for="returnExtentOnly">Extent Only</label>
          <select id="returnExtentOnly" name="returnExtentOnly">
            <option value="false" selected>false</option>
            <option value="true">true</option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="orderByFields">Order By Fields</label>
          <input type="text" id="orderByFields" name="orderByFields" value="" placeholder="field1 ASC">
        </div>
        <div class="form-group">
          <label for="resultOffset">Result Offset</label>
          <input type="number" id="resultOffset" name="resultOffset" value="" min="0" placeholder="0">
        </div>
      </div>

      <hr>
      <h3>Format</h3>
      <div class="form-group">
        <label for="f">Format (f)</label>
        <select id="f" name="f">
          <option value="json">JSON (Esri)</option>
          <option value="geojson">GeoJSON</option>
          <option value="pbf">PBF (Protocol Buffers)</option>
          <option value="pjson">Pretty JSON</option>
          <option value="html">HTML (this form)</option>
        </select>
      </div>

      <div class="actions">
        <button type="submit" class="btn btn-primary">Query (GET)</button>
        <button type="reset" class="btn btn-secondary">Reset</button>
      </div>
    </form>
  </div>
</body>
</html>`;
}

function layerInfoHtml(req, data) {
  const baseUrl = `${req.protocol}://${req.get('host')}${req.originalUrl.split('?')[0]}`;
  const queryUrl = `${baseUrl}/query`;
  const meta = data?.metadata || {};
  const fields = meta.fields || [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Layer: ${meta.name || 'Layer 0'} (FeatureServer)</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f4f4f4; color: #333; padding: 20px; }
    .container { max-width: 900px; margin: 0 auto; background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); padding: 24px; }
    .header { background: #0079c1; color: #fff; padding: 16px 24px; border-radius: 8px 8px 0 0; margin: -24px -24px 24px; }
    .header h1 { font-size: 18px; font-weight: 600; }
    h2 { font-size: 15px; color: #0079c1; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e8e8e8; font-size: 13px; }
    th { background: #f4f4f4; font-weight: 600; color: #555; }
    a { color: #0079c1; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .ops { margin-top: 20px; }
    .ops a { display: inline-block; background: #0079c1; color: #fff; padding: 8px 16px; border-radius: 4px; margin-right: 8px; font-size: 13px; font-weight: 600; }
    .ops a:hover { background: #005e95; text-decoration: none; }
    .prop { color: #888; }
    .val { font-family: 'Consolas', monospace; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>${meta.name || 'Layer 0'} (FeatureServer)</h1></div>
    <table>
      <tr><td class="prop">Name</td><td class="val">${meta.name || 'unknown'}</td></tr>
      <tr><td class="prop">Description</td><td class="val">${meta.description || ''}</td></tr>
      <tr><td class="prop">Geometry Type</td><td class="val">${meta.geometryType || 'unknown'}</td></tr>
      <tr><td class="prop">Feature Count</td><td class="val">${data?.count ?? data?.features?.length ?? 'unknown'}</td></tr>
    </table>

    ${fields.length > 0 ? `
    <h2>Fields</h2>
    <table>
      <tr><th>Name</th><th>Alias</th><th>Type</th></tr>
      ${fields.map((f) => `<tr><td>${f.name}</td><td>${f.alias || f.name}</td><td class="val">${f.type}</td></tr>`).join('\n      ')}
    </table>` : ''}

    <div class="ops">
      <h2>Supported Operations</h2>
      <a href="${queryUrl}?f=html">Query</a>
    </div>
  </div>
</body>
</html>`;
}

function shouldServeHtml(req) {
  const f = req.query?.f || req.body?.f;
  if (f === 'html') return true;
  if (f) return false;
  // No f param — check Accept header for text/html (browser request)
  const accept = req.get('accept') || '';
  return accept.includes('text/html');
}

module.exports = { queryFormHtml, layerInfoHtml, shouldServeHtml };
