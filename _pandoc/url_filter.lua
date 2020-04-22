function Image(img)
  if img.src:sub(1,1) == '/assets' then
    img.src.gsub('/assets', 'assets')
  end
  return img
end