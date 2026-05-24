from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class Role(models.TextChoices):
    OWNER              = 'OWNER',              'Owner / Director'
    HEADTEACHER        = 'HEADTEACHER',        'Headteacher'
    ACADEMIC_TEACHER   = 'ACADEMIC_TEACHER',   'Academic Teacher'
    DISCIPLINE_TEACHER = 'DISCIPLINE_TEACHER', 'Discipline Teacher'
    CLASS_TEACHER      = 'CLASS_TEACHER',      'Class Teacher'
    SUBJECT_TEACHER    = 'SUBJECT_TEACHER',    'Subject Teacher'
    TEACHER            = 'TEACHER',            'Teacher'   # legacy — kept for backward compat
    BURSAR             = 'BURSAR',             'Bursar'
    PARENT             = 'PARENT',             'Parent'
    STUDENT            = 'STUDENT',            'Student'

    # Convenience grouping (not stored values)
    @classmethod
    def teaching_roles(cls):
        return [
            cls.OWNER, cls.HEADTEACHER, cls.ACADEMIC_TEACHER,
            cls.DISCIPLINE_TEACHER, cls.CLASS_TEACHER, cls.SUBJECT_TEACHER,
            cls.TEACHER,
        ]


class CustomUserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email address is required')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
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
    email        = models.EmailField(unique=True)
    full_name    = models.CharField(max_length=255)
    phone        = models.CharField(max_length=20, blank=True)
    role         = models.CharField(max_length=20, choices=Role.choices, default=Role.TEACHER)
    profile_photo = models.ImageField(upload_to='profiles/', blank=True, null=True)

    is_active    = models.BooleanField(default=True)
    is_staff     = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)

    date_joined  = models.DateTimeField(auto_now_add=True)
    last_login   = models.DateTimeField(null=True, blank=True)

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
