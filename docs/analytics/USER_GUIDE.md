# Analytics: a guide for head teachers

Analytics turns the school's records into tables and charts. You choose **what** to count, **when**, and **for which classes**. Shule SMS does the counting for you.

You can use it to answer questions like these:

- What was the mean score in each class this term?
- Are the girls in Form 2 doing better or worse in Mathematics than last term?
- How much of this year's fees have we collected in each class?
- Which pupils are behind in paying fees?

You do not need to type any numbers. Everything comes from the marks, fees and pupil records that staff have already entered.

---

## 1. Opening analytics

1. Log in to Shule SMS.
2. Click **Analytics** in the sidebar on the left.

If you do not see **Analytics**, the module is not switched on for your school. Ask your system administrator.

---

## 2. The parts of the screen

| Part | Where | What it does |
|---|---|---|
| **Top bar** | Across the top | File menu, type of table or chart, **Options**, **Download**, and **Update** |
| **Dimensions panel** | On the left | The lists you choose from: **Data**, **Period**, **Classes**, and others such as Gender and Subject |
| **Layout** | Above the result | Three boxes: **Columns**, **Rows** and **Filter** (for charts: **Series**, **Category** and **Filter**) |
| **Result** | The big area in the middle | Your table or chart |

On a phone or small screen, the dimensions panel is hidden. Tap **Dimensions** at the top to open it.

### The three main lists

- **Data**: what you want to count or measure, for example *Mean score (%)*, *Enrolled students* or *Collected (billing period)*.
- **Period**: when, for example *This term*, *Last term*, *This academic year* or one quarter.
- **Classes**: which part of the school. You can choose the whole school, a level (Primary, O-Level), one class (Form 1) or one stream (Form 1 A).

### Columns, Rows and Filter

- Things in **Columns** go across the top of the table.
- Things in **Rows** go down the side.
- Things in **Filter** are not shown as their own column or row. They only limit what is counted. For example, put *Gender: Female* in Filter to count girls only.

---

## 3. Your first table: mean score by class

This example shows the mean score for each Form 1 to Form 4 class, this term and last term.

1. In the dimensions panel, click **Data**.
2. Find **Mean score (%)**. Click it so it moves to the selected side, then click **Update**.
3. Click **Period**. Choose **This term** and **Last term**, then click **Update**.
4. Click **Classes**. Choose **Form 1**, **Form 2**, **Form 3** and **Form 4**, then click **Update**.
5. Look at the layout. You want **Period** in **Columns** and **Classes** in **Rows**. To move a box, drag it, or click the **⋮** on it and choose where it should go.
6. Click **Update** in the top bar.

The table now shows one row per class and one column per term.

> **Tip:** When you change the layout, the words **Layout changed** appear at the top. The table only changes when you click **Update**.

---

## 4. Charts

1. In the top bar, open the type list (it starts as **Pivot table**).
2. Choose a chart: **Column chart**, **Stacked column chart**, **Bar chart**, **Line chart**, **Pie chart** or **Single value**.

A chart has room for fewer things than a table:

- **Series**: the coloured bars or lines, one colour for each item.
- **Category**: the labels along the bottom.
- A **Pie chart** or a **Single value** takes only one thing in Series and nothing in Category.

If your layout does not fit the chart, a yellow message explains why. Click **Fix layout** and Shule SMS moves the extra items to **Filter** for you.

A **Line chart** works well for change over time: put **Period** in **Category**.

---

## 5. Reading the numbers

### How the mean score is counted

The **Mean score** is *all the marks added together, divided by the number of marks*. Every mark counts once.

This matters when classes or pupils have different numbers of marks. Shule SMS does **not** take the average of each pupil's average, or the average of each class's average. So the mean for "Form 1 and Form 2 together" is always the true mean of all their marks.

### Numbers hidden with a star (\*)

Some staff see a **\*** instead of a score when fewer than 5 pupils are behind that number. With so few pupils, the "mean" could show one child's own mark. The star protects the pupils' privacy.

As head teacher, you always see the real numbers. Other staff, such as the academic teacher, may see stars.

### Fees: two kinds of "collected"

| Data item | Counts a payment in… | Use it to answer… |
|---|---|---|
| **Collected (billing period)** | the term or quarter of the **fee** it paid | "How much of the Quarter 1 fees has been paid?" |
| **Cash received (payment date)** | the date the **money arrived** | "How much money came in during March?" |

For example, a Quarter 1 fee paid in Quarter 2 counts as Quarter 1 under **Collected**, but as Quarter 2 under **Cash received**.

If your school does not use the Fees module, you will not see any fee data.

### Messages above the result

A yellow note sometimes appears above the result. For example: *"Enrolment is recorded per academic year; term and quarter periods show the whole year."* This means some data does not exist at the level you chose, so Shule SMS used the nearest level instead. The numbers are still correct for that level.

---

## 6. Seeing the pupils behind a number

In a **pivot table**, you can click a number to see the pupils it was counted from.

1. Build and update a pivot table.
2. Move the mouse over a number. If it becomes underlined, you can click it.
3. Click the number. A panel opens on the right. It shows:
   - what the number is (the data item, period, class and any filters);
   - each pupil's name and admission number;
   - the pupil's **current** class;
   - the pupil's own value. For *Mean score*, this is the pupil's own mean from the marks counted in that cell.
4. Click a pupil's name to open their record.
5. Press **Esc**, or click **✕**, to close the panel.

Pupils with the highest values are listed first. For example, the largest fee balances come first.

**Who can see pupil lists:**

- **Head teacher, owner and system administrator:** any number.
- **Class teacher:** only pupils in their own class. They see only their own class in analytics.
- **Academic teacher and bursar:** counts and fee numbers, but **not** score lists. Scores are hidden for them in small groups, and a pupil list would show those scores.

Every time someone opens a pupil list, Shule SMS records it in the audit log.

> A number cannot be clicked when it is a **\***, when you are not allowed to see its pupils, or in a chart. Switch to **Pivot table** to click numbers.

---

## 7. Saving and sharing

Use the **File** menu at the top left.

| Menu item | What it does |
|---|---|
| **New** | Start again with an empty layout |
| **Open…** | Open a table or chart you or other staff saved |
| **Save** | Save your changes |
| **Save as…** | Save a copy with a new name |
| **Rename…** | Change the name or description |
| **Pin to dashboard** | Show it on your dashboard every time you log in |
| **Delete** | Remove it for good |

When you save, you can tick **Share with staff**. Other staff can then open it too. They see it with **their own** permissions. For example, a class teacher who opens your shared chart sees only their own class.

Only the person who saved a visualization can change or delete it. Anyone else can use **Save as…** to make their own copy.

If a saved chart uses data that is no longer available, for example because a module was switched off, Shule SMS tells you what is missing instead of drawing it.

---

## 8. Downloading

Click **Download** in the top bar:

- **CSV (.csv)** or **Excel (.xlsx)**: the table, to open in Excel.
- **Image (.png)**: the chart as a picture, for a report or a staff meeting. This only works when a chart is showing.

---

## 9. Options

Click **Options** to change how the result looks:

- **Show dimension labels**: show the names of the lists (Period, Classes…) in the table.
- **Show data labels**: write the numbers on the chart.
- **Hide empty rows** and **Hide empty columns** (for charts: categories and series): hide rows or columns with no data.
- **Decimal places**: how many numbers after the dot.
- **Sort order**: sort a chart from high to low, or low to high.
- **Target line**: draw a line on a chart at a number you choose, for example a pass mark of 50.

---

## 10. Common questions

**"Choose at least one data item."** You have not chosen anything under **Data**. Click **Data** and pick at least one item.

**"This query could return up to … values."** You asked for too much at once, for example every subject × every class × every month. Choose fewer items, or move one list to **Filter**.

**"… cannot be broken down by …"** Some lists only work with some data. For example, *Subject* works with marks but not with fees. In the dimensions panel, lists that do not fit your data are greyed out. Move your mouse over one to see why.

**The table says "No data".** Nothing was recorded for what you chose. Check the period: marks for this term may not be entered yet.

**A stream is missing from the Classes list.** The list shows the streams that have pupils enrolled this year. If a stream is missing, ask the system administrator to check the pupils' enrolment.

**The numbers look different from the report cards.** Report cards show one exam for one pupil. Analytics adds up all marks in the period and classes you chose. Check that you picked the same exam period and classes.

**It is slow.** Very large tables, such as three years × every class × median, take a second or two. Choose fewer periods, or use **Mean** instead of **Median**, for a faster answer.

---

## 11. Data items at a glance

Which items you see depends on your role and on the modules your school uses.

| Group | Data items |
|---|---|
| **Enrolment** | Enrolled students · Students by status · Left during year · New admissions · % with special needs · Girls per 100 boys |
| **Academics** | Marks entered · Mean score (%) · Median score (%) · Lower and upper quartile (%) · Lowest and highest score (%) · Standard deviation · Candidates sat · Skill mean |
| **Fees** | Billed (gross) · Discounts & waivers · Net required · Outstanding · Collected (billing period) · Cash received (payment date) · Collection rate (%) · Uniform sales · Credit applied · Reversed payments · Paying students · Students with arrears |
| **SMS** | SMS messages · Delivery rate (%) · Failed SMS · Skipped SMS · SMS segments · SMS cost |

Open **Data** in the dimensions panel to see what each item counts: a short description is written under each name.
