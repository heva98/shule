# URL identifier policy

Rule: URLs that a browser can reach — anything in the frontend's address bar,
or an API path a client hits directly — must never expose a student's
sequential database ID or their admission number (`student_id`). Use the
opaque `public_id` (a random UUIDv4) instead.

## Why

- **Sequential PKs are enumerable.** `/students/42/` tells an attacker `/students/41/`
  and `/students/43/` probably exist too. That's a direct IDOR/enumeration
  vector against student records.
- **Admission numbers are PII**, not just IDs. They leak through logs,
  Referer headers, and browser history, and reusing them as a URL key makes
  that leakage worse — anyone who obtains one (a lost printout, a shared
  screenshot) gets a working lookup key.
- **A random public ID fixes both**: it can't be enumerated (not sequential,
  128 bits of entropy) and leaking it doesn't also leak a real-world
  identifier that means something outside the system.

This was a deliberate decision (see `students/models.py`), made after
explicitly rejecting two alternatives: keeping the admission number in the
URL, and using no identifier change at all (raw PK). Both were rejected for
the reasons above — this is a standing architectural rule, not a
one-off preference.

## The pattern

```python
# students/models.py
import uuid

class Student(models.Model):
    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    student_id = models.CharField(...)  # admission number — business data, not a lookup key
    ...
```

```python
# students/views.py
class StudentViewSet(ModelViewSet):
    lookup_field = 'public_id'
    lookup_value_regex = '[0-9a-f-]{36}'
```

Frontend routes and links use `student.public_id`, never `student.id` or
`student.student_id`:

```
/students/:publicId          # not /students/:id
/students/:publicId/edit
/students/:publicId/report-card
```

## Where the raw PK is still fine

Internal, server-to-server references — foreign keys, joins, one API
serializer embedding another model's numeric ID for an *authenticated,
already-scoped* nested lookup — don't need this treatment. The rule is about
what appears in a URL or is otherwise attacker-reachable as a lookup key, not
about database design. `ForeignKey(Student)` columns keep using the integer
PK exactly as normal; only outward-facing URLs need `public_id`.

## Applying this to new models

Any new model that gets its own detail/edit page or download link (the way
`documents`, `boarding`, `library` etc. do for students) should follow the
same pattern if the record contains anything sensitive enough that
enumeration or PII-in-URL would matter — not every model needs it (e.g. a
`Period` or `Subject` lookup table has no sensitive/personal data and
sequential IDs there are harmless). Use judgment: if the model represents a
person or a document tied to a person, add a `public_id`; if it's reference
data shared across the whole school, a plain PK is fine.
