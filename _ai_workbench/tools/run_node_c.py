import subprocess

js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js"

try:
    result = subprocess.run(["node", "-c", js_file], capture_output=True, text=True)
    print("STDOUT:", result.stdout)
    print("STDERR:", result.stderr)
except Exception as e:
    print(e)
