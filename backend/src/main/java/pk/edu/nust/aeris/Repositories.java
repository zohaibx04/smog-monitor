package pk.edu.nust.aeris;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import java.time.Instant;
import java.util.*;
interface AreaRepository extends JpaRepository<MonitoredArea,Long> {
    List<MonitoredArea> findByArchivedFalseOrderByIdAsc();
}
interface ReadingRepository extends JpaRepository<SmogReading,Long> {
    Optional<SmogReading> findFirstByAreaIdAndSourceOrderByTimestampDesc(Long areaId, String source);
    List<SmogReading> findByAreaIdAndSourceAndTimestampBetweenOrderByTimestampAsc(Long areaId, String source, Instant start, Instant end);
    boolean existsByAreaIdAndTimestampAndSource(Long areaId, Instant timestamp, String source);
    boolean existsByAreaId(Long areaId);
}
interface PreferenceRepository extends JpaRepository<AlertPreference,Long> {
    List<AlertPreference> findByAreaIdAndEnabledTrue(Long areaId);
}
interface AlertRepository extends JpaRepository<SmogAlert,Long> {
    List<SmogAlert> findAllByOrderByCreatedAtDesc();
    List<SmogAlert> findByPreferenceIdAndStatusIn(Long preferenceId, Collection<String> statuses);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
        update SmogAlert alert set alert.status = 'Resolved'
        where alert.status in ('Active', 'Acknowledged')
          and (not exists (
              select 1 from AlertPreference rule
              where rule.id = alert.preferenceId and rule.areaId = alert.areaId and rule.enabled = true
          ) or not exists (
              select 1 from MonitoredArea area
              where area.id = alert.areaId and area.active = true and area.archived = false
          ))
        """)
    void resolveIneligibleEpisodes();
}
