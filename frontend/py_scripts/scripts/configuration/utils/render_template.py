# =================================================================================================
#
# FILE: render_template.py (Upgraded Version)
#
# ROLE: A command-line utility for rendering Jinja2 templates from a file or string.
#
# DESCRIPTION: This script is designed to be called from another process. It now accepts
#              either a file path (`--template_path`) or raw string content (`--template-content`).
#              It renders the template with the given JSON parameters and prints a structured
#              JSON object to standard output indicating success or failure.
#
# =================================================================================================

# =================================================================================================
# SECTION 1: IMPORTS AND DEPENDENCIES
# =================================================================================================
import argparse
import json
import sys
from jinja2 import Environment, exceptions


# =================================================================================================
# SECTION 2: MAIN EXECUTION FUNCTION
# =================================================================================================
def main():
    """
    Main function that orchestrates the entire rendering process.
    It parses arguments, loads the template from either a path or string,
    renders it, and handles all potential errors.
    """
    # ---------------------------------------------------------------------------------------------
    # Subsection 2.1: Command-Line Argument Parsing
    # ---------------------------------------------------------------------------------------------
    parser = argparse.ArgumentParser(
        description="Render a Jinja2 template from a path or content string."
    )

    # --- FIX: ADD a new argument for the template file path ---
    # This aligns with the new refactored Node.js code.
    parser.add_argument(
        "--template_path", help="The full path to the Jinja2 template file to render."
    )

    # --- FIX: MAKE the old argument optional ---
    # The script can now accept one OR the other.
    parser.add_argument(
        "--template-content", help="The raw Jinja2 template content as a string."
    )

    # The parameters argument remains required.
    parser.add_argument(
        "--parameters",
        required=True,
        help="A JSON string representing the parameters for the template.",
    )
    args = parser.parse_args()

    # --- FIX: VALIDATE that a template source was provided ---
    if not args.template_path and not args.template_content:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": "A template source is required. Use either --template_path or --template-content.",
                }
            ),
            file=sys.stderr,
        )
        sys.exit(1)

    # ---------------------------------------------------------------------------------------------
    # Subsection 2.2: Template Loading, Rendering, and Error Handling
    # ---------------------------------------------------------------------------------------------
    try:
        parameters = json.loads(args.parameters)
        template_string = ""

        # --- FIX: LOGIC to load the template from the correct source ---
        if args.template_path:
            # If a path is provided, read the template file from the disk.
            try:
                with open(args.template_path, "r") as f:
                    template_string = f.read()
            except FileNotFoundError:
                # Handle the case where the file path is invalid.
                print(
                    json.dumps(
                        {
                            "success": False,
                            "error": f"Template file not found at path: {args.template_path}",
                        }
                    ),
                    file=sys.stderr,
                )
                sys.exit(1)
        else:
            # Otherwise, use the raw content string.
            template_string = args.template_content

        # The Jinja2 environment configuration remains the same.
        env = Environment(trim_blocks=True, lstrip_blocks=True)
        template = env.from_string(template_string)

        rendered_config = template.render(parameters)

        result = {"success": True, "rendered_config": rendered_config}
        print(json.dumps(result))

    except json.JSONDecodeError:
        error_result = {
            "success": False,
            "error": "Invalid JSON format for --parameters argument.",
        }
        print(json.dumps(error_result), file=sys.stderr)
    except exceptions.TemplateError as e:
        error_result = {"success": False, "error": f"Template syntax error: {str(e)}"}
        print(json.dumps(error_result), file=sys.stderr)
    except Exception as e:
        error_message = f"An unexpected error occurred: {type(e).__name__} - {str(e)}"
        error_result = {"success": False, "error": error_message}
        print(json.dumps(error_result), file=sys.stderr)
        sys.exit(1)


# =================================================================================================
# SECTION 3: SCRIPT ENTRY POINT
# =================================================================================================
if __name__ == "__main__":
    main()
