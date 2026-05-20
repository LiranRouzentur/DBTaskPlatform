
using System;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using TaskPlatform.Data.Persistence;

#nullable disable

namespace TaskPlatform.Data.migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260519145332_Init")]
    partial class Init
    {
        
        protected override void BuildTargetModel(ModelBuilder modelBuilder)
        {
#pragma warning disable 612, 618
            modelBuilder
                .HasAnnotation("ProductVersion", "10.0.8")
                .HasAnnotation("Relational:MaxIdentifierLength", 128);

            SqlServerModelBuilderExtensions.UseIdentityColumns(modelBuilder);

            modelBuilder.Entity("TaskPlatform.Domain.Entities.TaskAssignment", b =>
                {
                    b.Property<int>("TaskId")
                        .HasColumnType("int");

                    b.Property<int>("StatusDefinitionId")
                        .HasColumnType("int");

                    b.Property<DateTime>("AssignedAtUtc")
                        .HasColumnType("datetime2");

                    b.Property<int>("AssignedUserId")
                        .HasColumnType("int");

                    b.HasKey("TaskId", "StatusDefinitionId");

                    b.HasIndex("AssignedUserId");

                    b.HasIndex("StatusDefinitionId");

                    b.ToTable("TaskAssignments", (string)null);
                });

            modelBuilder.Entity("TaskPlatform.Domain.Entities.TaskFieldValue", b =>
                {
                    b.Property<int>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    SqlServerPropertyBuilderExtensions.UseIdentityColumn(b.Property<int>("Id"));

                    b.Property<bool?>("IsDeleted")
                        .HasColumnType("bit");

                    b.Property<string>("JsonValue")
                        .HasColumnType("nvarchar(max)");

                    b.Property<decimal?>("NumberValue")
                        .HasPrecision(18, 2)
                        .HasColumnType("decimal(18,2)");

                    b.Property<int>("StatusFieldSpecId")
                        .HasColumnType("int");

                    b.Property<string>("StringValue")
                        .HasColumnType("nvarchar(max)");

                    b.Property<int>("TaskId")
                        .HasColumnType("int");

                    b.HasKey("Id");

                    b.HasIndex("StatusFieldSpecId");

                    b.HasIndex("TaskId", "StatusFieldSpecId")
                        .IsUnique();

                    b.ToTable("TaskFieldValues", (string)null);
                });

            modelBuilder.Entity("TaskPlatform.Domain.Entities.TaskItem", b =>
                {
                    b.Property<int>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    SqlServerPropertyBuilderExtensions.UseIdentityColumn(b.Property<int>("Id"));

                    b.Property<DateTime>("CreatedAtUtc")
                        .HasColumnType("datetime2");

                    b.Property<int>("CurrentAssignedUserId")
                        .HasColumnType("int");

                    b.Property<int>("CurrentStatusDefinitionId")
                        .HasColumnType("int");

                    b.Property<bool>("IsClosed")
                        .HasColumnType("bit");

                    b.Property<bool?>("IsDeleted")
                        .HasColumnType("bit");

                    b.Property<byte[]>("RowVersion")
                        .IsConcurrencyToken()
                        .IsRequired()
                        .ValueGeneratedOnAddOrUpdate()
                        .HasColumnType("rowversion");

                    b.Property<int>("TaskTypeId")
                        .HasColumnType("int");

                    b.Property<DateTime>("UpdatedAtUtc")
                        .HasColumnType("datetime2");

                    b.HasKey("Id");

                    b.HasIndex("CurrentAssignedUserId");

                    b.HasIndex("CurrentStatusDefinitionId");

                    b.HasIndex("TaskTypeId");

                    b.HasIndex("CurrentAssignedUserId", "IsClosed");

                    b.ToTable("TaskItems", (string)null);
                });

            modelBuilder.Entity("TaskPlatform.Domain.Entities.User", b =>
                {
                    b.Property<int>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("int");

                    SqlServerPropertyBuilderExtensions.UseIdentityColumn(b.Property<int>("Id"));

                    b.Property<string>("FullName")
                        .IsRequired()
                        .HasMaxLength(128)
                        .HasColumnType("nvarchar(128)");

                    b.HasKey("Id");

                    b.ToTable("Users", (string)null);
                });

            modelBuilder.Entity("TaskPlatform.Domain.Workflow.StatusDefinition", b =>
                {
                    b.Property<int>("Id")
                        .HasColumnType("int");

                    b.Property<int>("Code")
                        .HasColumnType("int");

                    b.Property<bool>("IsFinal")
                        .HasColumnType("bit");

                    b.Property<string>("Name")
                        .IsRequired()
                        .HasMaxLength(128)
                        .HasColumnType("nvarchar(128)");

                    b.Property<int>("Position")
                        .HasColumnType("int");

                    b.Property<int>("TaskTypeId")
                        .HasColumnType("int");

                    b.HasKey("Id");

                    b.HasIndex("TaskTypeId", "Code")
                        .IsUnique();

                    b.HasIndex("TaskTypeId", "Position")
                        .IsUnique();

                    b.ToTable("StatusDefinitions", (string)null);
                });

            modelBuilder.Entity("TaskPlatform.Domain.Workflow.StatusFieldSpec", b =>
                {
                    b.Property<int>("Id")
                        .HasColumnType("int");

                    b.Property<int>("Kind")
                        .HasColumnType("int");

                    b.Property<int?>("MaxItems")
                        .HasColumnType("int");

                    b.Property<int?>("MinItems")
                        .HasColumnType("int");

                    b.Property<string>("Name")
                        .IsRequired()
                        .HasMaxLength(64)
                        .HasColumnType("nvarchar(64)");

                    b.Property<int>("Position")
                        .HasColumnType("int");

                    b.Property<bool>("Required")
                        .HasColumnType("bit");

                    b.Property<int>("StatusDefinitionId")
                        .HasColumnType("int");

                    b.HasKey("Id");

                    b.HasIndex("StatusDefinitionId", "Name")
                        .IsUnique();

                    b.HasIndex("StatusDefinitionId", "Position")
                        .IsUnique();

                    b.ToTable("StatusFieldSpecs", (string)null);
                });

            modelBuilder.Entity("TaskPlatform.Domain.Workflow.TaskType", b =>
                {
                    b.Property<int>("Id")
                        .HasColumnType("int");

                    b.Property<string>("Name")
                        .IsRequired()
                        .HasMaxLength(64)
                        .HasColumnType("nvarchar(64)");

                    b.HasKey("Id");

                    b.HasIndex("Name")
                        .IsUnique();

                    b.ToTable("TaskTypes", (string)null);
                });

            modelBuilder.Entity("TaskPlatform.Domain.Entities.TaskAssignment", b =>
                {
                    b.HasOne("TaskPlatform.Domain.Entities.User", null)
                        .WithMany()
                        .HasForeignKey("AssignedUserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("TaskPlatform.Domain.Workflow.StatusDefinition", null)
                        .WithMany()
                        .HasForeignKey("StatusDefinitionId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("TaskPlatform.Domain.Entities.TaskItem", null)
                        .WithMany("Assignments")
                        .HasForeignKey("TaskId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();
                });

            modelBuilder.Entity("TaskPlatform.Domain.Entities.TaskFieldValue", b =>
                {
                    b.HasOne("TaskPlatform.Domain.Workflow.StatusFieldSpec", "Spec")
                        .WithMany()
                        .HasForeignKey("StatusFieldSpecId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("TaskPlatform.Domain.Entities.TaskItem", null)
                        .WithMany("FieldValues")
                        .HasForeignKey("TaskId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();

                    b.Navigation("Spec");
                });

            modelBuilder.Entity("TaskPlatform.Domain.Entities.TaskItem", b =>
                {
                    b.HasOne("TaskPlatform.Domain.Entities.User", null)
                        .WithMany()
                        .HasForeignKey("CurrentAssignedUserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("TaskPlatform.Domain.Workflow.StatusDefinition", "CurrentStatusDefinition")
                        .WithMany()
                        .HasForeignKey("CurrentStatusDefinitionId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("TaskPlatform.Domain.Workflow.TaskType", null)
                        .WithMany()
                        .HasForeignKey("TaskTypeId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.Navigation("CurrentStatusDefinition");
                });

            modelBuilder.Entity("TaskPlatform.Domain.Workflow.StatusDefinition", b =>
                {
                    b.HasOne("TaskPlatform.Domain.Workflow.TaskType", null)
                        .WithMany("Statuses")
                        .HasForeignKey("TaskTypeId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("TaskPlatform.Domain.Workflow.StatusFieldSpec", b =>
                {
                    b.HasOne("TaskPlatform.Domain.Workflow.StatusDefinition", null)
                        .WithMany("Fields")
                        .HasForeignKey("StatusDefinitionId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();
                });

            modelBuilder.Entity("TaskPlatform.Domain.Entities.TaskItem", b =>
                {
                    b.Navigation("Assignments");

                    b.Navigation("FieldValues");
                });

            modelBuilder.Entity("TaskPlatform.Domain.Workflow.StatusDefinition", b =>
                {
                    b.Navigation("Fields");
                });

            modelBuilder.Entity("TaskPlatform.Domain.Workflow.TaskType", b =>
                {
                    b.Navigation("Statuses");
                });
#pragma warning restore 612, 618
        }
    }
}
