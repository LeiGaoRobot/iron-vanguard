# -*- coding: utf-8 -*-
"""把 shots/ 里的审核截图（rv_*.jpg）按微信审核表单的五大项分目录归档，并拼一张截图总览。
截图清单以「申报文案.md」各节的「配图」为准；重拍方法见 wechat/README.md。
用法: D:\\AI\\comfyui-venv\\Scripts\\python.exe collect.py
"""
import os
import shutil

SRC = 'D:/AI/mech_arena/shots'
DST = os.path.dirname(os.path.abspath(__file__))

# 每项按表单顺序,文件名前缀即上传顺序
GROUPS = {
    '1_场景': [
        ('rv_splash.jpg', '01_启动页_健康游戏忠告与适龄提示.jpg'),
        ('rv_title.jpg', '02_主界面_任务选择.jpg'),
        ('rv_scene_day.jpg', '03_白天城区演习场.jpg'),
        ('rv_scene_night.jpg', '04_夜间港湾区.jpg'),
        ('rv_scene_abyss.jpg', '05_海底基地.jpg'),
        ('rv_scene_forge.jpg', '06_熔岩地带.jpg'),
    ],
    '2_玩法': [
        ('rv_play_tutorial.jpg', '01_新兵训练_按钮提示.jpg'),
        ('rv_play_capture.jpg', '02_占领据点.jpg'),
        ('rv_play_defense.jpg', '03_守卫反应堆.jpg'),
        ('rv_play_convoy.jpg', '04_护送运输车_遭遇伏击.jpg'),
        ('rv_play_boss.jpg', '05_终波头目战_巨像.jpg'),
    ],
    '3_游戏背景': [
        ('rv_bg_lunar.jpg', '01_月面基地.jpg'),
        ('rv_bg_sky.jpg', '02_轨道电梯.jpg'),
        ('rv_bg_dune.jpg', '03_沙海.jpg'),
        ('rv_bg_snow.jpg', '04_暴雪中继站.jpg'),
    ],
    '4_扮演角色': [
        ('rv_role_paint1.jpg', '01_机库中的玩家机甲_白色涂装.jpg'),
        ('rv_role_paint2.jpg', '02_机库中的玩家机甲_蓝色涂装.jpg'),
        ('rv_role_abyss.jpg', '03_海底环境下的玩家机甲.jpg'),
        ('rv_role_boss.jpg', '04_敌方头目_暴君.jpg'),
    ],
    '5_系统功能': [
        ('rv_title.jpg', '系统1_任务选择.jpg'),
        ('rv_title_locked_toast.jpg', '系统1_未解锁任务.jpg'),
        ('rv_sys_overdrive.jpg', '系统2_超载启动.jpg'),
        ('rv_sys_reload.jpg', '系统2_武器装填中.jpg'),
        ('rv_sys_pause.jpg', '系统2_暂停菜单.jpg'),
        ('rv_sys_up.jpg', '系统3_机库强化.jpg'),
        ('rv_sys_arm.jpg', '系统3_机库武器.jpg'),
        ('rv_sys_result.jpg', '系统4_结算与进度.jpg'),
        ('rv_sys_revive.jpg', '系统4_复活.jpg'),
        ('rv_sys_medals.jpg', '系统4_勋章.jpg'),
    ],
}


def overview(paths, out, cols=6, w=320):
    """所有截图缩略图拼成一张,方便一眼核对。没装 Pillow 就跳过。"""
    try:
        from PIL import Image
    except ImportError:
        print('（没有 Pillow,跳过截图总览）')
        return
    h = w * 9 // 16
    rows = (len(paths) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * w, rows * h), (12, 16, 22))
    for i, p in enumerate(paths):
        sheet.paste(Image.open(p).convert('RGB').resize((w, h)), ((i % cols) * w, (i // cols) * h))
    sheet.save(out, quality=85)
    print('截图总览 ->', out)


if __name__ == '__main__':
    total, done = 0, []
    for g, items in GROUPS.items():
        d = os.path.join(DST, g)
        os.makedirs(d, exist_ok=True)
        # 清掉旧截图,目录里只留本清单的文件
        for f in os.listdir(d):
            if f.lower().endswith('.jpg') and f not in {n for _, n in items}:
                os.remove(os.path.join(d, f))
                print('删除旧图', g, f)
        for src, name in items:
            s = os.path.join(SRC, src)
            if not os.path.exists(s):
                print('缺少', src)
                continue
            p = os.path.join(d, name)
            shutil.copyfile(s, p)
            kb = os.path.getsize(p) / 1024
            flag = 'OK ' if 60 <= kb <= 5120 else '!! '
            print('%s%-10s %-34s %6.0f KB' % (flag, g, name, kb))
            total += 1
            done.append(p)
    overview(done, os.path.join(DST, '截图总览.jpg'))
    print('\n共 %d 张,全部 1280x720 JPEG' % total)
