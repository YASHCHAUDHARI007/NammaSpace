from pathlib import Path
import numpy as np
from PIL import Image
import torch
from nerfstudio.utils.eval_utils import eval_setup
saved_load = torch.load
torch.load = lambda *args, **kwargs: saved_load(*args, **({'weights_only': False} | kwargs))
config = Path('outputs/classroom/nerfstudio/classroom/splatfacto/2026-10-30_131213/config.yml')
_, pipeline, _, step = eval_setup(config, test_mode='inference')
for target in ('frame_00186.jpg',):
    match = None
    for dataset in (pipeline.datamanager.train_dataset, pipeline.datamanager.eval_dataset):
        for index, filename in enumerate(dataset.image_filenames):
            if filename.name == target:
                match = (dataset, index)
                break
        if match: break
    if not match:
        print('missing', target, flush=True)
        continue
    dataset, index = match
    camera = dataset.cameras[index:index + 1].to(pipeline.device)
    camera.rescale_output_resolution(0.5)
    with torch.no_grad():
        rgb = pipeline.model.get_outputs_for_camera(camera)['rgb'].cpu().numpy()
    out = Path('outputs/classroom/nerfstudio/export') / target.replace('.jpg', '-render.png')
    Image.fromarray(np.uint8(np.clip(rgb * 255, 0, 255))).save(out)
    print(step, target, rgb.shape, out, flush=True)
