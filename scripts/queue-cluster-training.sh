#!/usr/bin/env bash
# Run on nst-n6. Wait for an idle GPU, then train and export one classroom splat.
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
run_dir="$project_dir/outputs/classroom/nerfstudio"
mkdir -p "$run_dir"
exec 9>"$run_dir/queue.lock"
flock -n 9 || { echo "Another classroom training queue is already running"; exit 1; }

export PATH="$project_dir/.venv-ns/bin:$PATH"
export CUDA_HOME=/usr/local/cuda-13.2
threshold_mib=20000
printf '%s Waiting for %s MiB free GPU memory on nst-n6\n' "$(date -Is)" "$threshold_mib"

while true; do
  free_mib="$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits | head -1 | tr -d ' ')"
  if [[ "$free_mib" =~ ^[0-9]+$ ]] && (( free_mib >= threshold_mib )); then
    sleep 20
    free_mib="$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits | head -1 | tr -d ' ')"
    if [[ "$free_mib" =~ ^[0-9]+$ ]] && (( free_mib >= threshold_mib )); then
      break
    fi
  fi
  sleep 60
done

printf '%s GPU available (%s MiB free); starting training\n' "$(date -Is)" "$free_mib"
ns-train splatfacto \
  --data datasets/classroom/nerfstudio \
  --output-dir "$run_dir" \
  --experiment-name classroom \
  --vis tensorboard \
  --max-num-iterations 10000 \
  --steps-per-save 2000 \
  > "$run_dir/train-queued.log" 2>&1

config_path="$(find "$run_dir/classroom/splatfacto" -mindepth 2 -maxdepth 2 -name config.yml -type f -print | sort | tail -1)"
if [[ -z "$config_path" ]]; then
  echo "Training ended, but no Nerfstudio config was found" >&2
  exit 1
fi

printf '%s Training complete; exporting %s\n' "$(date -Is)" "$config_path"
ns-export gaussian-splat \
  --load-config "$config_path" \
  --output-dir "$run_dir/export" \
  --output-filename classroom-uncalibrated.ply \
  > "$run_dir/export.log" 2>&1
printf '%s Export complete: %s\n' "$(date -Is)" "$run_dir/export/classroom-uncalibrated.ply"
