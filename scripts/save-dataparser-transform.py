"""Save the Nerfstudio world transform needed for a standard splat export."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from nerfstudio.utils.eval_utils import eval_setup


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('config', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    _, pipeline, _, _ = eval_setup(args.config, test_mode='test')
    outputs = pipeline.datamanager.train_dataparser_outputs
    data = {
        'transform': outputs.dataparser_transform.cpu().numpy().tolist(),
        'scale': float(outputs.dataparser_scale),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, indent=2) + '\n')
    print(json.dumps(data, indent=2))


if __name__ == '__main__':
    main()
