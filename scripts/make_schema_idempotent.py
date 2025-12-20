"""
Script to make schema.sql idempotent by adding DROP POLICY IF EXISTS before each CREATE POLICY.
"""
import re

with open('supabase/schema.sql', 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to match CREATE POLICY statements
# Captures: policy name and table name
pattern = r'CREATE POLICY "([^"]+)"\s*\n\s*ON\s+(\w+)'

def add_drop_policy(match):
    policy_name = match.group(1)
    table_name = match.group(2)
    return f'DROP POLICY IF EXISTS "{policy_name}" ON {table_name};\nCREATE POLICY "{policy_name}"\n  ON {table_name}'

# Replace all occurrences
new_content = re.sub(pattern, add_drop_policy, content)

with open('supabase/schema.sql', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Done! Added DROP POLICY IF EXISTS before each CREATE POLICY.")

