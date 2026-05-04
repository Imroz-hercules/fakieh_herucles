#!/usr/bin/env python3
"""
Script to delete old orders from the database.
Supports different deletion criteria and safety checks.
"""

import os
import sys
from datetime import datetime, timedelta
import argparse

# Add the Backend directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app import app
from models import db
from models.orders import IntakeOrder, OutloadingOrder, BulkLineOrder, PTLineOrder

def get_order_counts():
    """Get current order counts from all tables"""
    with app.app_context():
        intake_count = IntakeOrder.query.count()
        outloading_count = OutloadingOrder.query.count()
        bulk_count = BulkLineOrder.query.count()
        pit_count = PTLineOrder.query.count()
        total_count = intake_count + outloading_count + bulk_count + pit_count
        
        return {
            'intake': intake_count,
            'outloading': outloading_count,
            'bulk': bulk_count,
            'pit': pit_count,
            'total': total_count
        }

def delete_orders_by_criteria(order_type=None, days_old=None, status=None, dry_run=True):
    """
    Delete orders based on specified criteria
    
    Args:
        order_type: 'intake', 'outloading', 'bulk', 'pit', or None for all
        days_old: Delete orders older than this many days
        status: 'completed' (is_complete=True) or 'active' (is_complete=False)
        dry_run: If True, only show what would be deleted without actually deleting
    """
    with app.app_context():
        # Determine which tables to process
        if order_type:
            tables = {order_type: get_model_class(order_type)}
        else:
            tables = {
                'intake': IntakeOrder,
                'outloading': OutloadingOrder,
                'bulk': BulkLineOrder,
                'pit': PTLineOrder
            }
        
        total_deleted = 0
        results = {}
        
        for table_name, model_class in tables.items():
            print(f"\nProcessing {table_name.upper()} orders...")
            
            # Build query
            query = model_class.query
            
            # Filter by completion status
            if status == 'completed':
                query = query.filter(model_class.is_complete == True)
                print(f"   Filtering for completed orders (is_complete=True)")
            elif status == 'active':
                query = query.filter(model_class.is_complete == False)
                print(f"   Filtering for active orders (is_complete=False)")
            
            # Filter by age
            if days_old:
                cutoff_date = datetime.utcnow() - timedelta(days=days_old)
                query = query.filter(model_class.created_at < cutoff_date)
                print(f"   Filtering for orders older than {days_old} days (before {cutoff_date.strftime('%Y-%m-%d %H:%M:%S')})")
            
            # Get orders to delete
            orders_to_delete = query.all()
            count = len(orders_to_delete)
            
            print(f"   Found {count} orders to delete")
            
            if count > 0:
                # Show sample of orders to be deleted
                print(f"   Sample orders to be deleted:")
                for i, order in enumerate(orders_to_delete[:5]):  # Show first 5
                    identifier = get_order_identifier(order, table_name)
                    created = order.created_at.strftime('%Y-%m-%d %H:%M:%S') if order.created_at else 'N/A'
                    print(f"      {i+1}. {identifier} - Created: {created}")
                
                if count > 5:
                    print(f"      ... and {count - 5} more orders")
                
                if not dry_run:
                    # Actually delete the orders
                    try:
                        for order in orders_to_delete:
                            db.session.delete(order)
                        
                        db.session.commit()
                        print(f"   Successfully deleted {count} {table_name} orders")
                        total_deleted += count
                        
                    except Exception as e:
                        db.session.rollback()
                        print(f"   Error deleting {table_name} orders: {e}")
                        count = 0
                else:
                    print(f"   DRY RUN: Would delete {count} {table_name} orders")
                    total_deleted += count
            
            results[table_name] = count
        
        return results, total_deleted

def get_model_class(order_type):
    """Get the model class for the given order type"""
    models = {
        'intake': IntakeOrder,
        'outloading': OutloadingOrder,
        'bulk': BulkLineOrder,
        'pit': PTLineOrder
    }
    return models.get(order_type)

def get_order_identifier(order, order_type):
    """Get a human-readable identifier for the order"""
    if order_type == 'intake':
        return f"Badge: {order.badge_no}, Dest: {order.destination_silo1}/{order.destination_silo2}"
    elif order_type == 'outloading':
        return f"Badge: {order.badge_no}, Dest: {order.destination_silo1}/{order.destination_silo2}"
    elif order_type == 'bulk':
        return f"Source: {order.source_silo}, Dest: {order.destination_silo1}/{order.destination_silo2}"
    elif order_type == 'pit':
        return f"Pit: {order.pit_no}, Dest: {order.destination_silo1}/{order.destination_silo2}"
    else:
        return f"ID: {order.id}"

def delete_all_orders(dry_run=True):
    """Delete all orders from all tables"""
    print("DELETING ALL ORDERS FROM ALL TABLES")
    print("=" * 50)
    
    with app.app_context():
        tables = {
            'intake': IntakeOrder,
            'outloading': OutloadingOrder,
            'bulk': BulkLineOrder,
            'pit': PTLineOrder
        }
        
        total_deleted = 0
        
        for table_name, model_class in tables.items():
            count = model_class.query.count()
            print(f"\n{table_name.upper()} orders: {count}")
            
            if count > 0:
                if not dry_run:
                    try:
                        model_class.query.delete()
                        db.session.commit()
                        print(f"Deleted all {count} {table_name} orders")
                        total_deleted += count
                    except Exception as e:
                        db.session.rollback()
                        print(f"Error deleting {table_name} orders: {e}")
                else:
                    print(f"DRY RUN: Would delete all {count} {table_name} orders")
                    total_deleted += count
        
        return total_deleted

def main():
    parser = argparse.ArgumentParser(description='Delete old orders from the database')
    parser.add_argument('--type', choices=['intake', 'outloading', 'bulk', 'pit'], 
                       help='Order type to delete (default: all types)')
    parser.add_argument('--days', type=int, 
                       help='Delete orders older than this many days')
    parser.add_argument('--status', choices=['completed', 'active'], 
                       help='Delete only completed or active orders')
    parser.add_argument('--all', action='store_true', 
                       help='Delete ALL orders from all tables')
    parser.add_argument('--execute', action='store_true', 
                       help='Actually perform the deletion (default is dry run)')
    parser.add_argument('--force', action='store_true', 
                       help='Skip confirmation prompts')
    
    args = parser.parse_args()
    
    print("ORDER DELETION SCRIPT")
    print("=" * 50)
    
    # Show current order counts
    print("\nCurrent order counts:")
    counts = get_order_counts()
    for order_type, count in counts.items():
        if order_type != 'total':
            print(f"   {order_type.upper()}: {count}")
    print(f"   TOTAL: {counts['total']}")
    
    if counts['total'] == 0:
        print("\nNo orders found in database. Nothing to delete.")
        return
    
    # Determine what to delete
    if args.all:
        print(f"\nWARNING: This will delete ALL {counts['total']} orders from the database!")
        action = "delete all orders"
    else:
        criteria = []
        if args.type:
            criteria.append(f"type: {args.type}")
        if args.days:
            criteria.append(f"older than {args.days} days")
        if args.status:
            criteria.append(f"status: {args.status}")
        
        if not criteria:
            criteria.append("all orders")
        
        action = f"delete orders with criteria: {', '.join(criteria)}"
    
    print(f"\nAction: {action}")
    print(f"Mode: {'DRY RUN' if not args.execute else 'EXECUTE'}")
    
    # Confirmation
    if not args.force and not args.execute:
        print("\nThis is a DRY RUN. Use --execute to actually delete orders.")
        print("Use --force to skip confirmation prompts.")
    elif not args.force:
        response = input(f"\nAre you sure you want to {action}? (yes/no): ")
        if response.lower() not in ['yes', 'y']:
            print("Operation cancelled.")
            return
    
    # Perform deletion
    if args.all:
        total_deleted = delete_all_orders(dry_run=not args.execute)
    else:
        results, total_deleted = delete_orders_by_criteria(
            order_type=args.type,
            days_old=args.days,
            status=args.status,
            dry_run=not args.execute
        )
    
    # Show results
    print(f"\nDELETION SUMMARY")
    print("=" * 30)
    if args.all:
        print(f"Total orders {'deleted' if args.execute else 'would be deleted'}: {total_deleted}")
    else:
        for order_type, count in results.items():
            print(f"{order_type.upper()}: {count} orders {'deleted' if args.execute else 'would be deleted'}")
        print(f"TOTAL: {total_deleted} orders {'deleted' if args.execute else 'would be deleted'}")
    
    if not args.execute:
        print(f"\nTo actually perform the deletion, run the same command with --execute flag")
    
    # Show final counts
    print(f"\nFinal order counts:")
    final_counts = get_order_counts()
    for order_type, count in final_counts.items():
        if order_type != 'total':
            print(f"   {order_type.upper()}: {count}")
    print(f"   TOTAL: {final_counts['total']}")

if __name__ == "__main__":
    main()
