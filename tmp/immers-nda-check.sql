SELECT id, email, signature_image_url IS NOT NULL AS has_signature FROM agents WHERE project_id=2 ORDER BY id DESC LIMIT 5;
