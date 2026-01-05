-- Convert URLs to relative paths that resolve via --resource-path=_site
local function fix_path(path)
  if not path then return path end

  -- Strip localhost dev server URLs
  path = path:gsub("^https?://localhost:[0-9]+/", "")

  -- Strip leading slash for absolute paths
  if path:sub(1,1) == '/' then
    path = path:sub(2)
  end

  return path
end

function Image(img)
  img.src = fix_path(img.src)
  return img
end