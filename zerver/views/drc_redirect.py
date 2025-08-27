from django.shortcuts import redirect

from django.conf import settings

def edirect(request):
    return redirect(settings.EDIRECT_REDIRECT)
