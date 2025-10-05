#!/usr/bin/env python3
"""
@file Report Generator
@description A simple, dedicated script that reads structured JSON data from stdin,
             formats it into human-readable tables using the 'tabulate' library,
             and prints the final report to stdout.
"""
import sys
import json
from tabulate import tabulate

def generate_report(data):
    """
    @description Takes a dictionary of script results and formats it into a string.
    @param {dict} data - The parsed JSON object from the main script's output.
    @returns {str} A string containing the fully formatted report.
    """
    report_lines = []

    # Check for a top-level error first
    if data.get("status") == "error":
        report_lines.append("="*40)
        report_lines.append(" SCRIPT EXECUTION FAILED")
        report_lines.append("="*40)
        report_lines.append(f"\nERROR: {data.get('message', 'An unknown error occurred.')}")
        return "\n".join(report_lines)

    report_lines.append("="*40)
    report_lines.append(" SCRIPT EXECUTION REPORT")
    report_lines.append("="*40)

    # Process results for each host
    for host_result in data.get("results_by_host", []):
        hostname = host_result.get("hostname", "Unknown Host")
        report_lines.append(f"\n\n--- Results for: {hostname} ---")

        if host_result.get("status") == "error":
            report_lines.append(f"  Status: FAILED")
            report_lines.append(f"  Reason: {host_result.get('message', 'No details provided.')}")
            continue

        report_lines.append(f"  Status: SUCCESS")
        
        # Format each individual test result into a table
        for test in host_result.get("test_results", []):
            if test.get("error"):
                report_lines.append(f"\n  [!] Test '{test.get('title', 'Untitled')}' failed: {test['error']}")
            elif test.get("data"):
                report_lines.append(f"\n  {test.get('title', 'Untitled Test')}:")
                # Use the 'grid' format which looks great in text files
                table = tabulate(test["data"], headers="keys", tablefmt="grid")
                # Indent the table for better readability in the report
                indented_table = "\n".join([f"    {line}" for line in table.split("\n")])
                report_lines.append(indented_table)

    return "\n".join(report_lines)

if __name__ == "__main__":
    try:
        # Read the full JSON data from standard input
        input_json = sys.stdin.read()
        input_data = json.loads(input_json)
        
        # Generate the report and print it to standard output
        report = generate_report(input_data)
        print(report)

    except Exception as e:
        # If this script fails, print the error to its own stderr
        print(f"FATAL: Report generation script failed: {e}", file=sys.stderr)
        sys.exit(1)
