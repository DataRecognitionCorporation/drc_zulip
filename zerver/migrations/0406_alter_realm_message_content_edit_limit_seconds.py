# Generated by Django 3.2.12 on 2022-04-12 14:51

from django.db import migrations, models
from django.db.backends.base.schema import BaseDatabaseSchemaEditor
from django.db.migrations.state import StateApps


def make_zero_invalid_for_message_content_edit_limit(
    apps: StateApps, schema_editor: BaseDatabaseSchemaEditor
) -> None:
    Realm = apps.get_model("zerver", "Realm")
    Realm.DEFAULT_MESSAGE_CONTENT_EDIT_LIMIT_SECONDS = 600

    Realm.objects.filter(allow_message_editing=True, message_content_edit_limit_seconds=0).update(
        message_content_edit_limit_seconds=None
    )

    Realm.objects.filter(allow_message_editing=False, message_content_edit_limit_seconds=0).update(
        message_content_edit_limit_seconds=Realm.DEFAULT_MESSAGE_CONTENT_EDIT_LIMIT_SECONDS
    )


def reverse_make_zero_invalid_for_message_content_edit_limit(
    apps: StateApps, schema_editor: BaseDatabaseSchemaEditor
) -> None:
    Realm = apps.get_model("zerver", "Realm")
    Realm.DEFAULT_MESSAGE_CONTENT_EDIT_LIMIT_SECONDS = 600

    Realm.objects.filter(
        allow_message_editing=True, message_content_edit_limit_seconds=None
    ).update(message_content_edit_limit_seconds=0)


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("zerver", "0405_set_default_for_enable_read_receipts"),
    ]

    operations = [
        migrations.AlterField(
            model_name="realm",
            name="message_content_edit_limit_seconds",
            field=models.IntegerField(default=600, null=True),
        ),
        migrations.RunPython(
            make_zero_invalid_for_message_content_edit_limit,
            reverse_code=reverse_make_zero_invalid_for_message_content_edit_limit,
            elidable=True,
        ),
        migrations.AlterField(
            model_name="realm",
            name="message_content_edit_limit_seconds",
            field=models.PositiveIntegerField(default=600, null=True),
        ),
    ]