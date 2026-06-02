SELECT id, email,
  IF(signature_image_url IS NULL OR TRIM(signature_image_url) = '', 0, 1) AS has_signature
FROM agents ORDER BY id;
