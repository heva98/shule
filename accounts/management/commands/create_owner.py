import getpass

from django.core.management.base import BaseCommand, CommandError

from accounts.models import Role, User


class Command(BaseCommand):
    help = 'Create the school owner (superuser) account interactively'

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING('Create Owner Account'))
        self.stdout.write('-' * 40)

        full_name = input('Full name: ').strip()
        if not full_name:
            raise CommandError('Full name cannot be empty.')

        email = input('Email: ').strip().lower()
        if not email:
            raise CommandError('Email cannot be empty.')
        if User.objects.filter(email=email).exists():
            raise CommandError(f'A user with email "{email}" already exists.')

        phone = input('Phone (e.g. +255712345678): ').strip()

        while True:
            password = getpass.getpass('Password: ')
            confirm = getpass.getpass('Confirm password: ')
            if password != confirm:
                self.stderr.write('Passwords do not match. Try again.')
            elif len(password) < 8:
                self.stderr.write('Password must be at least 8 characters.')
            else:
                break

        user = User.objects.create_superuser(
            email=email,
            password=password,
            full_name=full_name,
            phone=phone,
            role=Role.OWNER,
        )

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('Owner account created successfully'))
        self.stdout.write(f'  Name  : {user.full_name}')
        self.stdout.write(f'  Email : {user.email}')
        self.stdout.write(f'  Role  : {user.role}')
