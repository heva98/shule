from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class Role(models.TextChoices):
    OWNER              = 'OWNER',              'Owner / Director'
    SYSTEM_ADMIN       = 'SYSTEM_ADMIN',       'System Administrator'
    HEADTEACHER        = 'HEADTEACHER',        'Headteacher'
    ACADEMIC_TEACHER   = 'ACADEMIC_TEACHER',   'Academic Teacher'
    DISCIPLINE_TEACHER = 'DISCIPLINE_TEACHER', 'Discipline Teacher'
    CLASS_TEACHER      = 'CLASS_TEACHER',      'Class Teacher'
    SUBJECT_TEACHER    = 'SUBJECT_TEACHER',    'Subject Teacher'
    TEACHER            = 'TEACHER',            'Teacher'   # legacy
    BURSAR             = 'BURSAR',             'Bursar'
    PARENT             = 'PARENT',             'Parent'
    STUDENT            = 'STUDENT',            'Student'

    @classmethod
    def teaching_roles(cls):
        return [
            cls.OWNER, cls.HEADTEACHER, cls.ACADEMIC_TEACHER,
            cls.DISCIPLINE_TEACHER, cls.CLASS_TEACHER,
            cls.SUBJECT_TEACHER, cls.TEACHER,
        ]


class CustomUserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email address is required')
        email = self.normalize_email(email)
        user  = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)
        extra_fields.setdefault('role', Role.OWNER)
        if not extra_fields.get('is_staff'):
            raise ValueError('Superuser must have is_staff=True')
        if not extra_fields.get('is_superuser'):
            raise ValueError('Superuser must have is_superuser=True')
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    email         = models.EmailField(unique=True)
    full_name     = models.CharField(max_length=255)
    phone         = models.CharField(max_length=20, blank=True)
    role          = models.CharField(max_length=20, choices=Role.choices, default=Role.TEACHER)
    profile_photo = models.ImageField(upload_to='profiles/', blank=True, null=True)

    is_active    = models.BooleanField(default=True)
    is_staff     = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)

    date_joined = models.DateTimeField(auto_now_add=True)
    last_login  = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD  = 'email'
    REQUIRED_FIELDS = ['full_name']

    objects = CustomUserManager()

    class Meta:
        verbose_name        = 'User'
        verbose_name_plural = 'Users'
        ordering            = ['-date_joined']

    def __str__(self):
        return f'{self.full_name} <{self.email}>'


class UserNotification(models.Model):
    class Category(models.TextChoices):
        EXAM             = 'EXAM',             'Exam'
        CLASS_ASSIGNMENT = 'CLASS_ASSIGNMENT', 'Class Assignment'
        DISCIPLINE       = 'DISCIPLINE',       'Discipline'
        LEAVE            = 'LEAVE',            'Leave'
        GENERAL          = 'GENERAL',          'General'

    user       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    title      = models.CharField(max_length=255)
    message    = models.TextField()
    category   = models.CharField(
        max_length=20, choices=Category.choices, default=Category.GENERAL
    )
    is_read    = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user.full_name} | {self.title} | read={self.is_read}'


# ── Audit Log ─────────────────────────────────────────────────────────────────

class AuditLog(models.Model):
    class Action(models.TextChoices):
        USER_CREATED      = 'USER_CREATED',      'User Created'
        ROLE_CHANGED      = 'ROLE_CHANGED',       'Role Changed'
        USER_DEACTIVATED  = 'USER_DEACTIVATED',   'User Deactivated'
        USER_ACTIVATED    = 'USER_ACTIVATED',     'User Activated'
        SETTINGS_UPDATED  = 'SETTINGS_UPDATED',   'Settings Updated'
        SUBJECT_ADDED     = 'SUBJECT_ADDED',      'Subject Added'
        SUBJECT_UPDATED   = 'SUBJECT_UPDATED',    'Subject Updated'
        SUBJECT_DELETED   = 'SUBJECT_DELETED',    'Subject Deleted'
        YEAR_CREATED      = 'YEAR_CREATED',       'Academic Year Created'
        YEAR_UPDATED      = 'YEAR_UPDATED',       'Academic Year Updated'
        PASSWORD_RESET    = 'PASSWORD_RESET',     'Password Reset'
        LOGIN             = 'LOGIN',              'Login'
        LOGOUT            = 'LOGOUT',             'Logout'
        BULK_IMPORT       = 'BULK_IMPORT',        'Bulk Import'

    performed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='audit_logs',
    )
    action       = models.CharField(max_length=20, choices=Action.choices)
    target_model = models.CharField(max_length=50, blank=True)
    target_id    = models.CharField(max_length=50, blank=True)
    description  = models.TextField()
    ip_address   = models.GenericIPAddressField(null=True, blank=True)
    timestamp    = models.DateTimeField(auto_now_add=True)
    extra_data   = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        actor = self.performed_by.full_name if self.performed_by else 'System'
        return f'{actor} | {self.action} | {self.timestamp:%Y-%m-%d %H:%M}'


# ── School Settings (singleton) ───────────────────────────────────────────────

class SchoolSettings(models.Model):
    class SchoolType(models.TextChoices):
        PRIMARY   = 'PRIMARY',   'Primary School'
        SECONDARY = 'SECONDARY', 'Secondary School'
        COMBINED  = 'COMBINED',  'Combined (Primary + Secondary)'

    school_name         = models.CharField(max_length=255, default='Shule SMS School')
    school_motto        = models.CharField(max_length=255, blank=True)
    school_logo         = models.ImageField(upload_to='school/', blank=True, null=True)
    school_address      = models.TextField(blank=True)
    school_phone        = models.CharField(max_length=30, blank=True)
    school_email        = models.EmailField(blank=True)
    school_website      = models.CharField(max_length=255, blank=True)
    region              = models.CharField(max_length=100, blank=True)
    district            = models.CharField(max_length=100, blank=True)
    registration_number = models.CharField(max_length=100, blank=True)
    school_type         = models.CharField(
        max_length=10, choices=SchoolType.choices, default=SchoolType.COMBINED
    )
    # Which level groups this school operates — e.g. ["PRIMARY","OLEVEL","ALEVEL"]
    active_levels       = models.JSONField(
        default=list, blank=True,
        help_text='Level groups the school runs: PRIMARY, OLEVEL, ALEVEL',
    )
    established_year    = models.IntegerField(null=True, blank=True)

    class Meta:
        verbose_name = 'School Settings'

    def __str__(self):
        return self.school_name

    @classmethod
    def get_settings(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    @property
    def email_configured(self):
        from django.conf import settings as django_settings
        return bool(getattr(django_settings, 'EMAIL_HOST', ''))

    @property
    def sms_configured(self):
        return False
