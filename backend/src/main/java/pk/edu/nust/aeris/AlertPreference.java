package pk.edu.nust.aeris;
import jakarta.persistence.*;
@Entity
public class AlertPreference {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
    public Long areaId;
    public int aqiThreshold;
    public boolean enabled = true;
    @Column(nullable=false, columnDefinition="boolean default false")
    public boolean systemRule = false;
    public java.time.Instant lastEvaluatedAt;
    @com.fasterxml.jackson.annotation.JsonIgnore
    public String lastEvaluatedSource;
    public boolean aboveThreshold;
}
