# Первичная настройка Blender для автора: русский интерфейс и подсказки.
# Запуск: tools\blender.ps1 blender\setup_prefs.py
import bpy

prefs = bpy.context.preferences
prefs.view.language = 'ru_RU'
prefs.view.use_translate_interface = True
prefs.view.use_translate_tooltips = True
prefs.view.use_translate_new_dataname = False   # имена объектов остаются латиницей — их читает приложение
bpy.ops.wm.save_userpref()
print('PREFS OK', prefs.view.language)
