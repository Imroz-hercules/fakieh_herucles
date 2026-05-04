# Order Deletion Script

This script allows you to safely delete old orders from the database with various filtering options.

## Usage Examples

### 1. Dry Run (Safe - Shows what would be deleted)
```bash
# Show what would be deleted (no actual deletion)
python delete_old_orders.py

# Delete orders older than 30 days (dry run)
python delete_old_orders.py --days 30

# Delete only completed orders older than 7 days (dry run)
python delete_old_orders.py --days 7 --status completed

# Delete only intake orders older than 14 days (dry run)
python delete_old_orders.py --type intake --days 14
```

### 2. Actual Deletion (Use with caution)
```bash
# Delete orders older than 30 days
python delete_old_orders.py --days 30 --execute

# Delete only completed orders older than 7 days
python delete_old_orders.py --days 7 --status completed --execute

# Delete only intake orders older than 14 days
python delete_old_orders.py --type intake --days 14 --execute

# Delete all orders (DANGEROUS!)
python delete_old_orders.py --all --execute
```

### 3. Skip Confirmation Prompts
```bash
# Delete without confirmation prompts
python delete_old_orders.py --days 30 --execute --force
```

## Command Line Options

- `--type`: Order type to delete (`intake`, `outloading`, `bulk`, `pit`)
- `--days`: Delete orders older than this many days
- `--status`: Delete only `completed` or `active` orders
- `--all`: Delete ALL orders from all tables (DANGEROUS!)
- `--execute`: Actually perform the deletion (default is dry run)
- `--force`: Skip confirmation prompts

## Safety Features

1. **Dry Run by Default**: Script shows what would be deleted without actually deleting
2. **Confirmation Prompts**: Asks for confirmation before actual deletion
3. **Detailed Logging**: Shows exactly what orders will be deleted
4. **Count Verification**: Shows before and after counts

## Examples

### Clean up old completed orders
```bash
# Delete completed orders older than 30 days
python delete_old_orders.py --days 30 --status completed --execute
```

### Clean up specific order type
```bash
# Delete all intake orders older than 7 days
python delete_old_orders.py --type intake --days 7 --execute
```

### Emergency cleanup
```bash
# Delete ALL orders (use with extreme caution!)
python delete_old_orders.py --all --execute --force
```

## Output Example

```
🗑️  ORDER DELETION SCRIPT
==================================================

📊 Current order counts:
   INTAKE: 150
   OUTLOADING: 75
   BULK: 25
   PIT: 10
   TOTAL: 260

🎯 Action: delete orders with criteria: older than 30 days
🔍 Mode: DRY RUN

🔍 Processing INTAKE orders...
   📋 Filtering for orders older than 30 days (before 2024-10-15 10:30:00)
   📊 Found 45 orders to delete
   📝 Sample orders to be deleted:
      1. Badge: 21, Dest: 105/111 - Created: 2024-10-10 14:20:00
      2. Badge: 22, Dest: 108/115 - Created: 2024-10-12 09:15:00
      ... and 43 more orders
   🔍 DRY RUN: Would delete 45 intake orders

📊 DELETION SUMMARY
==============================
INTAKE: 45 orders would be deleted
OUTLOADING: 20 orders would be deleted
BULK: 5 orders would be deleted
PIT: 2 orders would be deleted
TOTAL: 72 orders would be deleted

💡 To actually perform the deletion, run the same command with --execute flag
```
