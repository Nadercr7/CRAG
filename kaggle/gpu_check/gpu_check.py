import subprocess
import sys

print(sys.version)
print(subprocess.run(["nvidia-smi"], capture_output=True, text=True).stdout)
import torch  # noqa: E402

print("torch", torch.__version__, "cuda", torch.cuda.is_available())
if torch.cuda.is_available():
    print(torch.cuda.get_device_name(0), torch.cuda.device_count())
