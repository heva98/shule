from rest_framework import serializers

from shule.utils import TERM_QUARTER_MAP

from .models import HomePackage


class HomePackageSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    subject_code = serializers.CharField(source='subject.code', read_only=True)
    posted_by_name = serializers.CharField(source='posted_by.full_name', read_only=True, default=None)
    term = serializers.SerializerMethodField()

    class Meta:
        model = HomePackage
        fields = [
            'id', 'title', 'instructions',
            'subject', 'subject_name', 'subject_code',
            'level', 'stream', 'academic_year', 'quarter', 'term', 'due_date',
            'attachment', 'posted_by', 'posted_by_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'posted_by', 'created_at', 'updated_at']

    def get_term(self, obj):
        return TERM_QUARTER_MAP.get(obj.quarter)
