-- Gán thứ tự 1,2,3… theo tên chỉ khi mọi bản ghi đều sort_order = 0 (tránh ghi đè khi đã chỉnh tay)
UPDATE hr_department_units u
SET sort_order = s.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name) AS rn
  FROM hr_department_units
) s
WHERE u.id = s.id
  AND (SELECT COUNT(*)::int FROM hr_department_units WHERE sort_order <> 0) = 0;
