-- Convert URLs to relative paths that resolve via --resource-path=_site
local function fix_path(path)
  if not path then return path end

  -- Strip localhost dev server URLs
  path = path:gsub("^https?://localhost:[0-9]+/", "")

  -- Strip speedshop.co domain URLs to make them local
  path = path:gsub("^https?://www%.speedshop%.co/", "")
  path = path:gsub("^https?://speedshop%.co/", "")

  -- Strip leading slash for absolute paths
  if path:sub(1,1) == '/' then
    path = path:sub(2)
  end

  return path
end

-- Check if URL is external (not local)
local function is_external_url(path)
  if not path then return false end
  -- Check if it starts with http:// or https:// and is not a local URL
  if path:match("^https?://") then
    -- Allow localhost URLs (they get converted to local paths)
    if path:match("^https?://localhost") then
      return false
    end
    -- Allow our own domain URLs
    if path:match("^https?://www%.speedshop%.co/") or path:match("^https?://speedshop%.co/") then
      return false
    end
    -- All other http(s) URLs are external
    return true
  end
  return false
end

function Image(img)
  -- Skip external images entirely - they often break PDF generation
  -- due to redirects, missing files, or returning HTML instead of images
  if is_external_url(img.src) then
    -- Return a simple text description instead
    return pandoc.Str("[Image: " .. (img.title or img.src) .. "]")
  end

  img.src = fix_path(img.src)
  return img
end