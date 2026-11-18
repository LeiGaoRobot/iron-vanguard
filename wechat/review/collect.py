# -*- coding: utf-8 -*-
"""把 shots/ 里选中的截图按微信审核表单的五大项分目录归档。
用法: D:\\AI\\comfyui-venv\\Scripts\\python.exe collect.py
"""
import os
import shutil

SRC = 'D:/AI/mech_arena/shots'
DST = os.path.dirname(os.path.abspath(__file__))

# 每项按表单顺序,文件名前缀即上传顺序
GROUPS = {
    '1_场景': [
        ('wx_01_title.jpg', '01_主界面_任务选择.jpg'),
        ('wx_02_scene_day.jpg', '02_白天城区演习场.jpg'),
        ('wx_03_scene_night.jpg', '03_夜间港湾区.jpg'),
        ('wx_06_scene_abyss.jpg', '04_海底基地.jpg'),
        ('wx_05_scene_forge.jpg', '05_熔岩地带.jpg'),
        ('wx_07_play_storm.jpg', '06_雷暴雨夜城区.jpg'),
    ],
    # 玩法组 = 五种不同的任务目标，每张横幅文字都不同
    '2_玩法': [
        ('wx_play2_uplink.jpg', '01_占领据点_CAPTURE.jpg'),
        ('wx_play2_defense.jpg', '02_守卫反应堆.jpg'),
        ('wx_play2_convoy.jpg', '03_护送运输车_遭遇伏击.jpg'),
        ('wx_09_play_extract.jpg', '04_下载数据终端.jpg'),
        ('wx_08_boss_a.jpg', '05_终波头目战_巨像.jpg'),
    ],
    '3_游戏背景': [
        ('wx_11_bg_lunar.jpg', '01_月面基地.jpg'),
        ('wx_12_bg_sky.jpg', '02_轨道电梯.jpg'),
        ('wx_13_bg_dune.jpg', '03_沙海.jpg'),
        ('wx_04_scene_snow.jpg', '04_暴雪中继站.jpg'),
    ],
    '4_扮演角色': [
        ('wx_14_char_mech_abyss.jpg', '01_玩家机甲_海底.jpg'),
        ('wx_16_char_mech_lunar.jpg', '02_玩家机甲_月面.jpg'),
        ('wx_20_char_mech_forge.jpg', '03_玩家机甲_熔岩.jpg'),
        ('wx_boss_tyrant_a.jpg', '04_玩家机甲与头目暴君.jpg'),
    ],
    # 系统2 = 四种界面状态，与玩法组不共用任何一张
    '5_系统功能': [
        ('wx_17_sys_mission.jpg', '系统1_任务选择.jpg'),
        ('wx_sys2_overdrive.jpg', '系统2_超载启动.jpg'),
        ('wx_sys2_reload.jpg', '系统2_武器装填中.jpg'),
        ('wx_18_sys_pause.jpg', '系统2_暂停菜单.jpg'),
        ('wx_19_sys_result.jpg', '系统3_结算与进度.jpg'),
    ],
}

if __name__ == '__main__':
    total = 0
    for g, items in GROUPS.items():
        d = os.path.join(DST, g)
        os.makedirs(d, exist_ok=True)
        for src, name in items:
            s = os.path.join(SRC, src)
            if not os.path.exists(s):
                print('缺少', src)
                continue
            p = os.path.join(d, name)
            shutil.copyfile(s, p)
            kb = os.path.getsize(p) / 1024
            flag = 'OK ' if 60 <= kb <= 5120 else '!! '
            print('%s%-14s %-28s %6.0f KB' % (flag, g, name, kb))
            total += 1
    print('\n共 %d 张,全部 1280x720 JPEG' % total)
